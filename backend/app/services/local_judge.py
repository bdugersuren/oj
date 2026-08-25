import os
import sys
import shutil
import tempfile
import subprocess
import time
import threading
import logging
import psutil
from typing import Tuple, List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class MemoryMonitor(threading.Thread):
    """
    Subprocess-ийн санах ойн ашиглалтыг тусдаа урсгалаар (thread) хянах.
    5ms тутамд ажиллаж буй процессын RSS болон түүний хүүхэд процессуудын санах ойг тооцно.
    """
    def __init__(self, pid: int):
        super().__init__()
        self.pid = pid
        self.max_mem_bytes = 0
        self.stop_event = threading.Event()

    def run(self):
        try:
            p = psutil.Process(self.pid)
            while not self.stop_event.is_set() and p.is_running():
                try:
                    # Хүүхэд процессуудыг оролцуулан санах ойг тооцох (ялангуяа java/python)
                    mem = p.memory_info().rss
                    for child in p.children(recursive=True):
                        mem += child.memory_info().rss
                    self.max_mem_bytes = max(self.max_mem_bytes, mem)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    break
                time.sleep(0.005) # 5ms тутамд шалгах
        except Exception:
            pass

    def stop(self):
        self.stop_event.set()


class LocalSubprocessJudge:
    """
    Локал систем дээр код хөрвүүлж, subprocess ашиглан тест кэйс тус бүрээр шалгах хөнгөн Judge.
    DMOJ Sandbox-ийг орлон ажиллах боломжтой.
    """
    @classmethod
    def resolve_testcase_data_from_disk(cls, problem_code: str, testcases_zip_key: Optional[str], test_cases: List[Any]) -> List[Any]:
        """
        Loads actual input/output data from the disk into the in-memory test_cases DB models
        if they are not present.
        """
        from pathlib import Path
        
        if not testcases_zip_key:
            return test_cases
            
        local_dir = Path("/problems") / f"oj-{problem_code}"
        
        # Ensure extracted
        marker_file = local_dir / "cases_extracted.txt"
        extracted = False
        if marker_file.exists():
            try:
                stored_key = marker_file.read_text(encoding="utf-8").strip()
                if stored_key == testcases_zip_key:
                    extracted = True
            except Exception:
                pass
                
        if not extracted:
            # Download and extract testcases
            logger.info(f"Downloading/Extracting testcases from disk for problem {problem_code}...")
            import zipfile
            import io
            import shutil
            from app.services.storage import storage_client
            
            bucket = "oj-private-problems"
            key = testcases_zip_key.replace("oj-private-problems/", "", 1)
            try:
                response = storage_client.client.get_object(bucket, key)
                zip_bytes = response.read()
                response.close()
                response.release_conn()
                
                shutil.rmtree(local_dir, ignore_errors=True)
                local_dir.mkdir(parents=True, exist_ok=True)
                
                from app.services.safe_archive import safe_extract_zip

                safe_extract_zip(zip_bytes, local_dir)
                    
                # DMOJ-ийн "archive: cases.zip" тохиргоонд зориулж хадгална
                with open(local_dir / "cases.zip", "wb") as f:
                    f.write(zip_bytes)
                    
                marker_file.write_text(testcases_zip_key, encoding="utf-8")
                logger.info(f"Successfully extracted testcases on disk to {local_dir}")
            except Exception as e:
                logger.exception(f"Failed to extract testcases on disk for {problem_code}: {e}")
                shutil.rmtree(local_dir, ignore_errors=True)

        # Parse init.yml
        init_file = local_dir / "init.yml"
        flat_files = []
        if init_file.exists():
            try:
                # Custom simple YAML parser to avoid loading large/slow libraries
                from app.api.v1.endpoints.problems import parse_simple_yaml
                init_cfg = parse_simple_yaml(init_file.read_text(encoding="utf-8"))
                testcases_cfg = init_cfg.get("test_cases", [])
                is_nested = len(testcases_cfg) > 0 and "cases" in testcases_cfg[0]
                if is_nested:
                    for subtask in testcases_cfg:
                        sub_cases_cfg = subtask.get("cases", [])
                        if isinstance(sub_cases_cfg, list):
                            for tc in sub_cases_cfg:
                                flat_files.append((tc.get("in"), tc.get("out")))
                else:
                    for tc in testcases_cfg:
                        flat_files.append((tc.get("in"), tc.get("out")))
            except Exception as e:
                logger.error(f"Failed to parse init.yml on disk for {problem_code}: {e}")

        # Update testcase input/output in memory
        for idx, tc in enumerate(test_cases):
            # If the database input_data/output_data is None or empty, load from disk
            if (getattr(tc, "input_data", None) is None or getattr(tc, "output_data", None) is None) and flat_files:
                order = getattr(tc, "order", None)
                t_idx = (order - 1) if (order is not None and 0 < order <= len(flat_files)) else idx
                if 0 <= t_idx < len(flat_files):
                    in_file, out_file = flat_files[t_idx]
                    in_path = local_dir / in_file if in_file else None
                    out_path = local_dir / out_file if out_file else None
                    
                    if in_path and not in_path.exists():
                        in_path = local_dir / "cases" / in_file
                    if out_path and not out_path.exists():
                        out_path = local_dir / "cases" / out_file
                        
                    try:
                        if in_path and in_path.exists():
                            tc.input_data = in_path.read_text(encoding="utf-8", errors="replace")
                        if out_path and out_path.exists():
                            tc.output_data = out_path.read_text(encoding="utf-8", errors="replace")
                    except Exception as e:
                        logger.error(f"Failed to read testcase file from disk: {e}")
        return test_cases
    @staticmethod
    def compile_code(language: str, source_code: str, work_dir: str) -> Tuple[bool, Optional[str], Optional[List[str]]]:
        """
        Код хөрвүүлэх шаардлагатай бол хөрвүүлнэ.
        Буцаах утга: (Амжилттай эсэх, Алдааны лог, Ажиллуулах тушаал)
        """
        language = language.lower()
        
        # C++ компиляци (C++11, C++14, C++17, C++20, C++23)
        if language in ("cpp", "c++", "g++11", "g++14", "g++17", "g++20", "g++23", "clang++"):
            src_path = os.path.join(work_dir, "solution.cpp")
            bin_path = os.path.join(work_dir, "solution.out")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            compiler = "g++"
            if language == "clang++":
                compiler = "clang++"
                
            std_flag = "-std=c++17"
            if language == "g++11":
                std_flag = "-std=c++11"
            elif language == "g++14":
                std_flag = "-std=c++14"
            elif language == "g++20":
                std_flag = "-std=c++20"
            elif language == "g++23":
                std_flag = "-std=c++2b"
                
            cmd = [compiler, "-O3", std_flag, src_path, "-o", bin_path, "-lm"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, [bin_path]
            
        # C компиляци
        elif language in ("c", "gcc", "gcc11", "gcc23", "clang"):
            src_path = os.path.join(work_dir, "solution.c")
            bin_path = os.path.join(work_dir, "solution.out")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            compiler = "gcc"
            if language == "clang":
                compiler = "clang"
                
            std_flag = "-std=c11"
            if language == "gcc23":
                std_flag = "-std=c2x"
                
            cmd = [compiler, "-O3", std_flag, src_path, "-o", bin_path, "-lm"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, [bin_path]
            
        # Java компиляци
        elif language in ("java", "java8"):
            src_path = os.path.join(work_dir, "Solution.java")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            cmd = ["javac", src_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, ["java", "-cp", work_dir, "Solution"]
            
        # Python
        elif language in ("python", "python3", "py", "pypy", "pypy3"):
            src_path = os.path.join(work_dir, "solution.py")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            runner = "python3"
            if language == "python":
                runner = "python"
            elif language == "pypy":
                runner = "pypy"
            elif language == "pypy3":
                runner = "pypy3"
                
            return True, None, [runner, src_path]
            
        # Pascal
        elif language in ("pascal", "fpc"):
            src_path = os.path.join(work_dir, "solution.pas")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            cmd = ["fpc", "-O2", src_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            bin_path = os.path.join(work_dir, "solution")
            return True, None, [bin_path]
            
        # Go
        elif language == "go":
            src_path = os.path.join(work_dir, "solution.go")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            bin_path = os.path.join(work_dir, "solution")
            cmd = ["go", "build", "-o", bin_path, src_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, [bin_path]
            
        # Rust
        elif language in ("rust", "cargo"):
            src_path = os.path.join(work_dir, "solution.rs")
            bin_path = os.path.join(work_dir, "solution")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            cmd = ["rustc", "-O", src_path, "-o", bin_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, [bin_path]
            
        # Node (JavaScript)
        elif language == "node":
            src_path = os.path.join(work_dir, "solution.js")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
            return True, None, ["node", src_path]
            
        # C# Mono
        elif language == "mono-csc":
            src_path = os.path.join(work_dir, "solution.cs")
            bin_path = os.path.join(work_dir, "solution.exe")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
                
            cmd = ["mcs", src_path, f"-out:{bin_path}"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                return False, res.stderr, None
            return True, None, ["mono", bin_path]
            
        return False, f"Unsupported language: {language}", None

    @classmethod
    def execute_testcase(
        cls,
        run_cmd: List[str],
        input_data: str,
        expected_output: str,
        time_limit_sec: float,
        memory_limit_mb: int,
        work_dir: str,
        checker_bin: Optional[str] = None
    ) -> Tuple[str, float, float, Optional[str]]:
        """
        Нэг тест кэйсийг subprocess-оор ажиллуулах.
        Буцаах: (Статус: AC/WA/TLE/MLE/RTE, ажилласан хугацаа ms, санах ой KB, log)
        """
        # Normalize carriage returns for inputs
        input_data = input_data.replace("\r\n", "\n")
        start_time = time.time()
        
        proc = subprocess.Popen(
            run_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=work_dir,
            text=True
        )
        
        # Санах ойн хяналтыг асаах
        monitor = MemoryMonitor(proc.pid)
        monitor.start()
        
        stdout_data, stderr_data = "", ""
        status = "AC"
        error_log = None
        
        try:
            stdout_data, stderr_data = proc.communicate(input=input_data, timeout=time_limit_sec)
            exit_code = proc.returncode
            execution_time_ms = (time.time() - start_time) * 1000
        except subprocess.TimeoutExpired:
            # TLE алдаа
            proc.kill()
            try:
                stdout_data, stderr_data = proc.communicate(timeout=0.2)
            except Exception:
                pass
            status = "TLE"
            exit_code = -9
            execution_time_ms = time_limit_sec * 1000
        except Exception as e:
            proc.kill()
            status = "RTE"
            exit_code = -1
            error_log = str(e)
            execution_time_ms = 0
            
        # Санах ойн хяналтыг зогсоох
        monitor.stop()
        monitor.join()
        
        memory_used_kb = monitor.max_mem_bytes / 1024
        
        # MLE шалгах
        if memory_used_kb / 1024 > memory_limit_mb:
            status = "MLE"
            
        # RTE шалгах (хэрэв TLE/MLE болоогүй бөгөөд exit code != 0)
        elif status == "AC" and exit_code != 0:
            status = "RTE"
            error_log = stderr_data
            
        # WA эсвэл Custom Checker шалгах
        elif status == "AC":
            if checker_bin:
                in_path = os.path.join(work_dir, "input.in")
                cand_path = os.path.join(work_dir, "candidate.out")
                exp_path = os.path.join(work_dir, "expected.out")
                
                with open(in_path, "w", encoding="utf-8") as f:
                    f.write(input_data)
                with open(cand_path, "w", encoding="utf-8") as f:
                    f.write(stdout_data)
                with open(exp_path, "w", encoding="utf-8") as f:
                    f.write(expected_output)
                    
                try:
                    chk_res = subprocess.run(
                        [checker_bin, in_path, cand_path, exp_path],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=5.0
                    )
                    # Testlib return codes: 0 = AC, 1 = WA, 2 = PE, 3 = FAIL
                    if chk_res.returncode == 0:
                        status = "AC"
                    else:
                        status = "WA"
                    error_log = chk_res.stderr or chk_res.stdout
                except subprocess.TimeoutExpired:
                    status = "WA"
                    error_log = "Checker timed out."
                except Exception as e:
                    status = "WA"
                    error_log = f"Checker failed to run: {e}"
            else:
                normalized_student = stdout_data.replace("\r\n", "\n").strip()
                normalized_expected = expected_output.replace("\r\n", "\n").strip()
                if normalized_student != normalized_expected:
                    status = "WA"
                
        return status, round(execution_time_ms, 2), round(memory_used_kb, 2), error_log or stderr_data, stdout_data

    @classmethod
    def grade_submission(
        cls,
        language: str,
        source_code: str,
        test_cases: List[Dict[str, Any]],
        time_limit_sec: float,
        memory_limit_mb: int,
        checker_code: Optional[str] = None,
        checker_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Бүх тест кэйс дээр кодыг ажиллуулж, нэгдсэн үр дүн гаргах.
        """
        with tempfile.TemporaryDirectory() as work_dir:
            # 1. Компиляци хийх
            success, err_log, run_cmd = cls.compile_code(language, source_code, work_dir)
            if not success:
                return {
                    "status": "CE",
                    "score": 0,
                    "time_ms": 0.0,
                    "memory_kb": 0.0,
                    "error_log": err_log,
                    "test_results": []
                }
                
            # 2. Checker компиляци хийх
            checker_bin = None
            if checker_code and checker_type:
                checker_type = checker_type.lower()
                if checker_type in ("cpp", "c++"):
                    chk_src = os.path.join(work_dir, "checker.cpp")
                    chk_bin = os.path.join(work_dir, "checker.out")
                    with open(chk_src, "w", encoding="utf-8") as f:
                        f.write(checker_code)
                    
                    cmd = ["g++", "-O3", "-std=c++17", chk_src, "-o", chk_bin]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    if res.returncode == 0:
                        checker_bin = chk_bin
                    else:
                        logger.error(f"Custom checker compile failed: {res.stderr}")
                
            test_results = []
            total_score = 0
            max_time_ms = 0.0
            max_memory_kb = 0.0
            overall_status = "AC"
            
            # Статусын эрэмбэ (аль алдаа нь илүү өндөр давуу эрхтэй вэ)
            priority_statuses = ["TLE", "MLE", "RTE", "WA"]
            
            # 3. Тестүүдийг ажиллуулах
            is_subtask_grading = len(test_cases) > 0 and "cases" in test_cases[0]
            
            if is_subtask_grading:
                # Subtask-based grading (Багц оноо бодох)
                for subtask in test_cases:
                    subtask_points = subtask.get("points", 10)
                    subtask_cases = subtask.get("cases", [])
                    
                    subtask_ok = True
                    subtask_results = []
                    
                    for tc in subtask_cases:
                        tc_id = tc.get("id", 0)
                        input_str = tc.get("input_data", "")
                        output_str = tc.get("output_data", "")
                        
                        status, time_ms, mem_kb, log, stdout_val = cls.execute_testcase(
                            run_cmd=run_cmd,
                            input_data=input_str,
                            expected_output=output_str,
                            time_limit_sec=time_limit_sec,
                            memory_limit_mb=memory_limit_mb,
                            work_dir=work_dir,
                            checker_bin=checker_bin
                        )
                        
                        max_time_ms = max(max_time_ms, time_ms)
                        max_memory_kb = max(max_memory_kb, mem_kb)
                        
                        if status != "AC":
                            subtask_ok = False
                            
                        # Ерөнхий статусыг шинэчлэх
                        if status != "AC":
                            if overall_status == "AC":
                                overall_status = status
                            elif overall_status in priority_statuses and status in priority_statuses:
                                if priority_statuses.index(status) < priority_statuses.index(overall_status):
                                    overall_status = status
                                    
                        subtask_results.append({
                            "testcase_id": tc_id,
                            "status": status,
                            "time_ms": time_ms,
                            "memory_kb": mem_kb,
                            "checker_output": log,
                            "actual_output": stdout_val
                        })
                    
                    if subtask_ok:
                        total_score += subtask_points
                        
                    test_results.extend(subtask_results)
            else:
                # Flat grading (Ердийн тест кэйс бүрээр оноо бодох)
                for tc in test_cases:
                    tc_id = tc.get("id", 0)
                    input_str = tc.get("input_data", "")
                    output_str = tc.get("output_data", "")
                    points = tc.get("points", 10)
                    
                    status, time_ms, mem_kb, log, stdout_val = cls.execute_testcase(
                        run_cmd=run_cmd,
                        input_data=input_str,
                        expected_output=output_str,
                        time_limit_sec=time_limit_sec,
                        memory_limit_mb=memory_limit_mb,
                        work_dir=work_dir,
                        checker_bin=checker_bin
                    )
                    
                    # Оноо бодох
                    tc_score = points if status == "AC" else 0
                    total_score += tc_score
                    
                    max_time_ms = max(max_time_ms, time_ms)
                    max_memory_kb = max(max_memory_kb, mem_kb)
                    
                    test_results.append({
                        "testcase_id": tc_id,
                        "status": status,
                        "time_ms": time_ms,
                        "memory_kb": mem_kb,
                        "checker_output": log,
                        "actual_output": stdout_val
                    })
                    
                    # Ерөнхий статусыг шинэчлэх
                    if status != "AC":
                        if overall_status == "AC":
                            overall_status = status
                        elif overall_status in priority_statuses and status in priority_statuses:
                            if priority_statuses.index(status) < priority_statuses.index(overall_status):
                                overall_status = status
                                
            return {
                "status": overall_status,
                "score": total_score,
                "time_ms": max_time_ms,
                "memory_kb": max_memory_kb,
                "error_log": None if overall_status == "AC" else f"Grade failed with {overall_status}",
                "test_results": test_results
            }
