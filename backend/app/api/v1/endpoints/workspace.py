import io
import os
import re
import zipfile
import shutil
import tempfile
import logging
import subprocess
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
import anyio

from app.core.database import get_db
from app.core.dependencies import require_role
from app.services.storage import storage_client
from app.models.user import User
from app.models.problem import Problem, TestCase, DifficultyLevel, OlympiadScope, DivisionCategory

logger = logging.getLogger(__name__)
router = APIRouter()

BUCKET_DRAFTS = "oj-workspace-drafts"
BUCKET_PRIVATE = "oj-private-problems"
BUCKET_PROBLEMS = "oj-problems" # problems assets bucket

class FileSavePayload(BaseModel):
    content: str

class GeneratePayload(BaseModel):
    params: List[str] # List of generator parameters, e.g. ["10 100", "1000 5000"]
    points_per_case: int = 10

class PublishPayload(BaseModel):
    title: str
    time_limit: float = 1.0
    memory_limit: int = 64
    difficulty: DifficultyLevel = DifficultyLevel.BRONZE
    topic: str = "Brute Force"
    olympiad_scope: OlympiadScope = OlympiadScope.TRAINING
    division: DivisionCategory = DivisionCategory.SENIOR
    olympiad_year: Optional[int] = None
    source_citation: Optional[str] = None

# Helper functions for drafts bucket using minio client

def _list_draft_files(user_id: str, code: str) -> List[str]:
    prefix = f"{user_id}/{code.upper()}/"
    objects = storage_client.client.list_objects(BUCKET_DRAFTS, prefix=prefix, recursive=True)
    return [obj.object_name.replace(prefix, "", 1) for obj in objects]

def _read_draft_file(user_id: str, code: str, filename: str) -> str:
    key = f"{user_id}/{code.upper()}/{filename}"
    try:
        response = storage_client.client.get_object(BUCKET_DRAFTS, key)
        content = response.read().decode("utf-8")
        response.close()
        response.release_conn()
        return content
    except Exception as e:
        logger.error(f"Failed to read draft file {key}: {e}")
        raise HTTPException(status_code=404, detail=f"File {filename} not found in drafts.")

def _write_draft_file(user_id: str, code: str, filename: str, content: str):
    key = f"{user_id}/{code.upper()}/{filename}"
    data = content.encode("utf-8")
    storage_client.client.put_object(
        BUCKET_DRAFTS,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type="text/plain"
    )

def _read_draft_file_bytes(user_id: str, code: str, filename: str) -> bytes:
    key = f"{user_id}/{code.upper()}/{filename}"
    try:
        response = storage_client.client.get_object(BUCKET_DRAFTS, key)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except Exception as e:
        logger.error(f"Failed to read draft bytes {key}: {e}")
        raise HTTPException(status_code=404, detail=f"File {filename} not found in drafts.")

def _write_draft_file_bytes(user_id: str, code: str, filename: str, data: bytes, content_type: str = "application/octet-stream"):
    key = f"{user_id}/{code.upper()}/{filename}"
    storage_client.client.put_object(
        BUCKET_DRAFTS,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type
    )

def _delete_draft_file(user_id: str, code: str, filename: str):
    key = f"{user_id}/{code.upper()}/{filename}"
    try:
        storage_client.client.remove_object(BUCKET_DRAFTS, key)
    except Exception as e:
        logger.error(f"Failed to delete draft file {key}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not delete file {filename}")

def _delete_draft_prefix(user_id: str, code: str):
    prefix = f"{user_id}/{code.upper()}/"
    objects = storage_client.client.list_objects(BUCKET_DRAFTS, prefix=prefix, recursive=True)
    for obj in objects:
        storage_client.client.remove_object(BUCKET_DRAFTS, obj.object_name)

def _import_published_to_drafts(user_id: str, problem: Problem, testcases: List[TestCase]):
    """Imports published problem files to teacher's drafts workspace."""
    code = problem.code.upper()
    
    # 1. Statement
    _write_draft_file(user_id, code, "statement.md", problem.statement_markdown)
    
    # 2. Extract private zip if exists
    if problem.testcases_zip_key:
        zip_key = problem.testcases_zip_key.replace("oj-private-problems/", "", 1)
        try:
            response = storage_client.client.get_object(BUCKET_PRIVATE, zip_key)
            zip_data = response.read()
            response.close()
            response.release_conn()
            
            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                for name in zf.namelist():
                    if not name.endswith("/"):
                        file_content = zf.read(name).decode("utf-8", errors="replace")
                        _write_draft_file(user_id, code, name, file_content)
            return
        except Exception as e:
            logger.error(f"Failed to copy published zip to drafts: {e}")
            
    # 3. Fallback: Create draft from DB testcases
    tc_lines = []
    for idx, tc in enumerate(testcases, start=1):
        in_name = f"cases/{idx}.in"
        out_name = f"cases/{idx}.out"
        _write_draft_file(user_id, code, in_name, tc.input_data or "")
        _write_draft_file(user_id, code, out_name, tc.output_data or "")
        tc_lines.append(f"  - {{in: {in_name}, out: {out_name}, points: {tc.points}, sample: {str(tc.is_sample).lower()}}}")
        
    init_yml = (
        f"archive: cases.zip\n"
        f"time_limit: {problem.time_limit}\n"
        f"memory_limit: {problem.memory_limit}\n"
        f"test_cases:\n" + "\n".join(tc_lines) + "\n"
    )
    _write_draft_file(user_id, code, "init.yml", init_yml)
    
    # Write empty templates for solution and generator
    _write_draft_file(user_id, code, "solution.cpp", "#include <iostream>\nusing namespace std;\nint main() {\n    return 0;\n}")
    _write_draft_file(user_id, code, "generator.cpp", '#include "testlib.h"\n#include <iostream>\nusing namespace std;\nint main(int argc, char* argv[]) {\n    registerGen(argc, argv, 1);\n    return 0;\n}')


# --- API Routes ---

@router.get("/{code}/files", summary="Уг бодлогын ажлын талбарын файлуудыг жагсаах")
async def get_workspace_files(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    # 1. Хэрэв drafts дотор файл байвал жагсаалтыг аваад буцаана
    def _list():
        return _list_draft_files(user_id, code)
        
    files = await anyio.to_thread.run_sync(_list)
    
    # 2. Хоосон байвал DB-ээс эх сурвалжийг олоод хуулж эхлүүлнэ
    if not files:
        result = await db.execute(
            select(Problem)
            .options(selectinload(Problem.test_cases))
            .where(Problem.code == code)
        )
        problem = result.scalar_one_or_none()
        
        if problem:
            # Импортлох ажлыг урсгалд ажиллуулна
            def _import():
                _import_published_to_drafts(user_id, problem, problem.test_cases)
                return _list_draft_files(user_id, code)
                
            files = await anyio.to_thread.run_sync(_import)
        else:
            # Шинэ бодлого үүсгэхэд зориулсан загвар файлууд бэлтгэх
            def _init_new():
                _write_draft_file(user_id, code, "statement.md", "# Бодлогын гарчиг\n\nЭнд бодлогын тайлбарыг бичнэ үү.\n\n### Оролт\n\n### Гаралт\n\n### Жишээ\n| Оролт | Гаралт |\n| --- | --- |\n| 1 2 | 3 |\n")
                _write_draft_file(user_id, code, "solution.cpp", "#include <iostream>\nusing namespace std;\nint main() {\n    int a, b;\n    if (cin >> a >> b) cout << a + b << endl;\n    return 0;\n}")
                _write_draft_file(user_id, code, "generator.cpp", '#include "testlib.h"\n#include <iostream>\nusing namespace std;\nint main(int argc, char* argv[]) {\n    registerGen(argc, argv, 1);\n    // Жишээ: opt(1) ашиглан санамсаргүй оролт үүсгэх\n    int a = rnd.next(1, 100);\n    int b = rnd.next(1, 100);\n    cout << a << " " << b << endl;\n    return 0;\n}')
                _write_draft_file(user_id, code, "init.yml", "archive: cases.zip\ntime_limit: 1.0\nmemory_limit: 64\ntest_cases:\n  - {in: cases/1.in, out: cases/1.out, points: 10, sample: true}\n")
                _write_draft_file(user_id, code, "cases/1.in", "1 2\n")
                _write_draft_file(user_id, code, "cases/1.out", "3\n")
                return _list_draft_files(user_id, code)
                
            files = await anyio.to_thread.run_sync(_init_new)
            
    return files


@router.get("/{code}/files/{filename:path}", summary="Файлын агуулгыг унших")
async def get_workspace_file_content(
    code: str,
    filename: str,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    def _read():
        return _read_draft_file(user_id, code, filename)
        
    return {"filename": filename, "content": await anyio.to_thread.run_sync(_read)}


@router.post("/{code}/files/{filename:path}", summary="Файлын агуулгыг хадгалах")
async def save_workspace_file_content(
    code: str,
    filename: str,
    payload: FileSavePayload,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    def _save():
        _write_draft_file(user_id, code, filename, payload.content)
        
    await anyio.to_thread.run_sync(_save)
    return {"status": "success", "message": f"File '{filename}' successfully saved."}


@router.post("/{code}/generate-testcases", summary="Тест кэйсийг автоматаар үүсгэх (Generator & Model Solution)")
async def generate_workspace_testcases(
    code: str,
    payload: GeneratePayload,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    # Файлуудыг татаж аваад локал түр хавтаст компиляци хийнэ
    def _generate():
        # 1. Шаардлагатай файлуудыг унших
        try:
            solution_code = _read_draft_file(user_id, code, "solution.cpp")
            generator_code = _read_draft_file(user_id, code, "generator.cpp")
        except Exception:
            raise ValueError("Уг бодлогод 'solution.cpp' болон 'generator.cpp' бэлтгэгдээгүй байна.")
            
        with tempfile.TemporaryDirectory() as temp_dir:
            # 2. Compile solution.cpp
            sol_src = os.path.join(temp_dir, "solution.cpp")
            sol_bin = os.path.join(temp_dir, "solution.out")
            with open(sol_src, "w", encoding="utf-8") as f:
                f.write(solution_code)
                
            res = subprocess_run(["g++", "-O3", "-std=c++17", sol_src, "-o", sol_bin, "-lm"])
            if res.returncode != 0:
                raise ValueError(f"Model Solution (solution.cpp) компиляцийн алдаа:\n{res.stderr}")
                
            # 3. Copy testlib.h and Compile generator.cpp
            # testlib.h файлыг олох
            testlib_path = "/usr/include/testlib.h"
            if not os.path.exists(testlib_path):
                # Download testlib.h from GitHub if missing in development
                import urllib.request
                try:
                    urllib.request.urlretrieve("https://raw.githubusercontent.com/MikeMirzayanov/testlib/master/testlib.h", os.path.join(temp_dir, "testlib.h"))
                except Exception as e:
                    logger.error(f"Failed to fetch testlib.h from github: {e}")
            else:
                shutil.copy(testlib_path, os.path.join(temp_dir, "testlib.h"))
                
            gen_src = os.path.join(temp_dir, "generator.cpp")
            gen_bin = os.path.join(temp_dir, "generator.out")
            with open(gen_src, "w", encoding="utf-8") as f:
                f.write(generator_code)
                
            res = subprocess_run(["g++", "-O3", "-std=c++17", gen_src, "-o", gen_bin])
            if res.returncode != 0:
                raise ValueError(f"Generator (generator.cpp) компиляцийн алдаа:\n{res.stderr}")
                
            # 4. Generate inputs and outputs
            generated_cases = []
            tc_configs = []
            
            # Start order from existing count or 1
            order_idx = 1
            
            for p_idx, gen_args in enumerate(payload.params, start=1):
                input_file = os.path.join(temp_dir, f"case_{p_idx}.in")
                output_file = os.path.join(temp_dir, f"case_{p_idx}.out")
                
                # Run generator: gen.out [args] > input.in
                args_list = [gen_bin] + gen_args.split()
                with open(input_file, "w", encoding="utf-8") as inf:
                    res = subprocess_run(args_list, stdout=inf)
                    if res.returncode != 0:
                        raise ValueError(f"Generator ажиллуулахад алдаа гарлаа (Аргумент: '{gen_args}'):\n{res.stderr}")
                        
                # Run model solution: solution.out < input.in > output.out
                with open(input_file, "r") as inf, open(output_file, "w") as outf:
                    res = subprocess_run([sol_bin], stdin=inf, stdout=outf)
                    if res.returncode != 0:
                        raise ValueError(f"Model Solution ажиллуулахад алдаа гарлаа:\n{res.stderr}")
                        
                # Read content to write to drafts
                in_content = ""
                out_content = ""
                with open(input_file, "r", encoding="utf-8", errors="replace") as f:
                    in_content = f.read()
                with open(output_file, "r", encoding="utf-8", errors="replace") as f:
                    out_content = f.read()
                    
                in_key = f"cases/{order_idx}.in"
                out_key = f"cases/{order_idx}.out"
                
                _write_draft_file(user_id, code, in_key, in_content)
                _write_draft_file(user_id, code, out_key, out_content)
                sample_str = ", sample: true" if order_idx == 1 else ""
                tc_configs.append(f"  - {{in: {in_key}, out: {out_key}, points: {payload.points_per_case}{sample_str}}}")
                generated_cases.append({"idx": order_idx, "args": gen_args})
                order_idx += 1
                
            # 5. init.yml шинэчлэх
            init_content = (
                f"archive: cases.zip\n"
                f"time_limit: 1.0\n"
                f"memory_limit: 64\n"
                f"test_cases:\n" + "\n".join(tc_configs) + "\n"
            )
            _write_draft_file(user_id, code, "init.yml", init_content)
            
            # Save generator parameters and points for UI persistence
            params_str = "\n".join(payload.params)
            _write_draft_file(user_id, code, "generator.params", params_str)
            _write_draft_file(user_id, code, "generator.points", str(payload.points_per_case))
            
            return generated_cases

    try:
        results = await anyio.to_thread.run_sync(_generate)
        return {"status": "success", "message": f"{len(results)} testcases generated successfully.", "cases": results}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.exception("Failed to generate testcases")
        raise HTTPException(status_code=500, detail=f"Алдаа гарлаа: {str(e)}")


@router.post("/{code}/upload-testcases-zip", summary="Тест кэйсийг ZIP файлаар шууд оруулах (тайлбарлан задлах)")
async def upload_workspace_testcases_zip(
    code: str,
    file: UploadFile = File(...),
    points_per_case: int = Query(10, alias="points_per_case"),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)

    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Зөвхөн ZIP архив оруулах боломжтой.")

    zip_bytes = await file.read()

    def _process_zip():
        try:
            archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except Exception as e:
            raise ValueError(f"ZIP файлыг нээхэд алдаа гарлаа: {str(e)}")

        file_list = archive.namelist()
        
        # 1. Look for init.yml inside the ZIP
        init_yml_content = None
        init_yml_name = next((f for f in file_list if f.endswith("init.yml")), None)
        if init_yml_name:
            try:
                init_yml_content = archive.read(init_yml_name).decode("utf-8", errors="replace")
            except Exception as e:
                logger.error(f"Failed to read init.yml from ZIP: {e}")

        # 2. Extract inputs and outputs
        in_pattern = re.compile(r"^(.*?)\.(in|input)$", re.IGNORECASE)
        out_pattern = re.compile(r"^(.*?)\.(out|output)$", re.IGNORECASE)

        inputs = {}
        outputs = {}

        for name in file_list:
            if name.endswith("/"):
                continue
            
            in_match = in_pattern.match(os.path.basename(name))
            if in_match:
                base = in_match.group(1)
                inputs[base] = name
                continue
                
            out_match = out_pattern.match(os.path.basename(name))
            if out_match:
                base = out_match.group(1)
                outputs[base] = name

        # 3. Match pairs
        matched_bases = sorted(list(inputs.keys() & outputs.keys()), key=lambda s: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)])
        
        if not matched_bases:
            raise ValueError("ZIP файл дотор тохирох оролт (.in) болон гаралт (.out) файлын хосууд олдсонгүй.")

        # 4. Extract limits and custom properties from existing init.yml
        time_limit = 1.0
        memory_limit = 64
        existing_cases = []
        
        if init_yml_content:
            try:
                import yaml
                parsed_init = yaml.safe_load(init_yml_content)
                if isinstance(parsed_init, dict):
                    time_limit = float(parsed_init.get("time_limit", 1.0))
                    memory_limit = int(parsed_init.get("memory_limit", 64))
                    existing_cases = parsed_init.get("test_cases", [])
                    if not isinstance(existing_cases, list):
                        existing_cases = []
            except Exception as e:
                logger.error(f"Failed to parse init.yml yaml content: {e}")

        # 5. Save cases to drafts and build YAML configs
        tc_configs = []
        order_idx = 1

        for base in matched_bases:
            in_name = inputs[base]
            out_name = outputs[base]

            try:
                in_data = archive.read(in_name).decode("utf-8", errors="replace")
                out_data = archive.read(out_name).decode("utf-8", errors="replace")
            except Exception as e:
                raise ValueError(f"Файлуудыг уншихад алдаа гарлаа ({in_name}, {out_name}): {str(e)}")

            in_key = f"cases/{order_idx}.in"
            out_key = f"cases/{order_idx}.out"

            _write_draft_file(user_id, code, in_key, in_data)
            _write_draft_file(user_id, code, out_key, out_data)

            # Determine points and sample flag
            pts = points_per_case
            is_sample = (order_idx == 1)

            # Try to map points/sample from existing init.yml if possible
            if len(existing_cases) >= order_idx:
                existing_item = existing_cases[order_idx - 1]
                if isinstance(existing_item, dict):
                    pts = existing_item.get("points", points_per_case)
                    is_sample = existing_item.get("sample", is_sample)

            sample_str = ", sample: true" if is_sample else ""
            tc_configs.append(f"  - {{in: {in_key}, out: {out_key}, points: {pts}{sample_str}}}")
            order_idx += 1

        # 6. Save init.yml
        init_content = (
            f"archive: cases.zip\n"
            f"time_limit: {time_limit}\n"
            f"memory_limit: {memory_limit}\n"
            f"test_cases:\n" + "\n".join(tc_configs) + "\n"
        )
        _write_draft_file(user_id, code, "init.yml", init_content)
        
        # Save generator metadata mock to keep UI synchronized
        _write_draft_file(user_id, code, "generator.points", str(points_per_case))
        _write_draft_file(user_id, code, "generator.params", "# ZIP Uploaded Cases")

        return len(matched_bases)

    try:
        count = await anyio.to_thread.run_sync(_process_zip)
        return {"status": "success", "message": f"{count} testcases imported from ZIP successfully.", "count": count}
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.exception("Failed to import testcases ZIP")
        raise HTTPException(status_code=500, detail=f"Алдаа гарлаа: {str(e)}")


@router.post("/{code}/publish", summary="Ажлын талбарын файлуудыг нийтэлж баталгаажуулах")
async def publish_workspace(
    code: str,
    payload: PublishPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    # 1. Draft-аас бүх файлуудын жагсаалтыг авах
    def _read_drafts_and_zip():
        files = _list_draft_files(user_id, code)
        if not files:
            raise ValueError("Хадгалсан файл байхгүй тул нийтлэх боломжгүй.")
            
        statement_md = ""
        init_yml_content = ""
        
        # public/statement.md-д бичих өгүүлбэрийг авах
        try:
            statement_md = _read_draft_file(user_id, code, "statement.md")
        except Exception:
            statement_md = "# " + payload.title
            
        try:
            init_yml_content = _read_draft_file(user_id, code, "init.yml")
        except Exception:
            init_yml_content = f"archive: cases.zip\ntime_limit: {payload.time_limit}\nmemory_limit: {payload.memory_limit}\n"
            
        # private/ хэсэгт бичих zip файлыг үүсгэх
        private_zip_buffer = io.BytesIO()
        with zipfile.ZipFile(private_zip_buffer, "w", zipfile.ZIP_DEFLATED) as pz:
            # init.yml нэмэх
            pz.writestr("init.yml", init_yml_content)
            
            # Бусад нэмэлт файлуудыг нэмэх (checker.py, cases/ гэх мэт)
            for f in files:
                if f in ("statement.md", "init.yml", "generator.params", "generator.points") or f.startswith("assets/"):
                    continue
                # Read content and write (binary safe)
                f_bytes = _read_draft_file_bytes(user_id, code, f)
                pz.writestr(f, f_bytes)
                
        return statement_md, init_yml_content, private_zip_buffer.getvalue()

    try:
        statement_md, init_yml_content, zip_bytes = await anyio.to_thread.run_sync(_read_drafts_and_zip)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.exception("Failed to package drafts")
        raise HTTPException(status_code=500, detail=f"Алдаа гарлаа: {str(e)}")
        
    # 2. MinIO-руу upload хийх
    # Statement copy to public problems bucket
    statement_io = io.BytesIO(statement_md.encode("utf-8"))
    statement_key = f"{code}/statement.md"
    await storage_client.upload_file(
        bucket=BUCKET_PROBLEMS,
        key=statement_key,
        data=statement_io,
        length=len(statement_md.encode("utf-8")),
        content_type="text/markdown"
    )
    
    # Private package (zip) to private problems bucket
    private_key = f"{code}/cases.zip"
    await storage_client.upload_file(
        bucket=BUCKET_PRIVATE,
        key=private_key,
        data=io.BytesIO(zip_bytes),
        length=len(zip_bytes)
    )
    
    # Copy all assets in draft assets/ prefix to public BUCKET_PROBLEMS under key {code}/assets/{filename}
    def _copy_assets():
        draft_files = _list_draft_files(user_id, code)
        for f in draft_files:
            if f.startswith("assets/"):
                data = _read_draft_file_bytes(user_id, code, f)
                ext = f.split(".")[-1].lower() if "." in f else ""
                content_type = "application/octet-stream"
                if ext in ("png", "jpg", "jpeg", "gif", "svg", "webp"):
                    content_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
                elif ext == "pdf":
                    content_type = "application/pdf"
                
                key = f"{code}/{f}"
                storage_client.client.put_object(
                    BUCKET_PROBLEMS,
                    key,
                    io.BytesIO(data),
                    length=len(data),
                    content_type=content_type
                )
    await anyio.to_thread.run_sync(_copy_assets)
    
    # 3. Өгөгдлийн санд бодлогыг хадгалах / шинэчлэх
    result = await db.execute(select(Problem).where(Problem.code == code))
    problem = result.scalar_one_or_none()
    
    if not problem:
        problem = Problem(
            code=code,
            title=payload.title,
            statement_markdown=statement_md,
            time_limit=payload.time_limit,
            memory_limit=payload.memory_limit,
            difficulty=payload.difficulty,
            topic=payload.topic,
            olympiad_scope=payload.olympiad_scope,
            division=payload.division,
            olympiad_year=payload.olympiad_year,
            source_citation=payload.source_citation,
            testcases_zip_key=f"oj-private-problems/{private_key}",
            created_by_id=current_user.id
        )
        db.add(problem)
    else:
        problem.title = payload.title
        problem.statement_markdown = statement_md
        problem.time_limit = payload.time_limit
        problem.memory_limit = payload.memory_limit
        problem.difficulty = payload.difficulty
        problem.topic = payload.topic
        problem.olympiad_scope = payload.olympiad_scope
        problem.division = payload.division
        problem.olympiad_year = payload.olympiad_year
        problem.source_citation = payload.source_citation
        problem.testcases_zip_key = f"oj-private-problems/{private_key}"
        
    await db.flush()
    
    # DB доторх хуучин TestCase-үүдийг устгаад, Sample testcases-үүдийг шинээр үүсгэн бүртгэх
    await db.execute(delete(TestCase).where(TestCase.problem_id == problem.id))
    
    from app.api.v1.endpoints.problems import parse_simple_yaml
    init_cfg = parse_simple_yaml(init_yml_content)
    testcases_cfg = init_cfg.get("test_cases", [])
    
    flat_testcases = []
    if isinstance(testcases_cfg, list):
        for item in testcases_cfg:
            if not isinstance(item, dict):
                continue
            if "in" in item and "out" in item:
                # Flat testcase format
                flat_testcases.append({
                    "in": item.get("in"),
                    "out": item.get("out"),
                    "points": int(item.get("points", 10)),
                    "sample": item.get("sample", False)
                })
            elif "cases" in item:
                # Subtask nested format
                sub_points = int(item.get("points", 10))
                sub_cases = item.get("cases")
                if isinstance(sub_cases, list):
                    for tc in sub_cases:
                        if isinstance(tc, dict):
                            tc_points = int(tc.get("points", sub_points))
                            flat_testcases.append({
                                "in": tc.get("in"),
                                "out": tc.get("out"),
                                "points": tc_points,
                                "sample": tc.get("sample", False)
                            })

        
    order_idx = 1
    for tc in flat_testcases:
        is_sample = str(tc.get("sample", "false")).lower() == "true"
        in_file = tc.get("in")
        out_file = tc.get("out")
        points = int(tc.get("points", 10))
        
        input_data = ""
        output_data = ""
        
        if is_sample and in_file and out_file:
            # Draft-аас sample тестийн оролт гаралтыг унших
            try:
                def _read_samples():
                    in_d = _read_draft_file(user_id, code, in_file)
                    out_d = _read_draft_file(user_id, code, out_file)
                    return in_d, out_d
                input_data, output_data = await anyio.to_thread.run_sync(_read_samples)
            except Exception:
                pass
                
        db_tc = TestCase(
            problem_id=problem.id,
            input_data=input_data if is_sample else None,
            output_data=output_data if is_sample else None,
            points=points,
            order=order_idx,
            is_sample=is_sample
        )
        db.add(db_tc)
        order_idx += 1
        
    await db.commit()
    
    # 4. Draft хавтсыг цэвэрлэх
    def _clean():
        _delete_draft_prefix(user_id, code)
    await anyio.to_thread.run_sync(_clean)
    
    return {"status": "success", "message": f"Бодлого '{code}' амжилттай нийтлэгдэж баталгаажлаа."}


# Subprocess run wrapper helper
def subprocess_run(cmd, stdin=None, stdout=None) -> subprocess.CompletedProcess:
    try:
        res = subprocess.run(
            cmd,
            stdin=stdin,
            stdout=stdout,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10.0
        )
        return res
    except subprocess.TimeoutExpired as te:
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=-9,
            stdout="",
            stderr="Хугацаа хэтэрлээ (10 сек)"
        )
    except Exception as e:
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=-1,
            stdout="",
            stderr=str(e)
        )


class CreateFilePayload(BaseModel):
    filename: str
    template_type: Optional[str] = None


@router.post("/{code}/create-file", summary="Workspace-д шинээр файл үүсгэх")
async def create_workspace_file(
    code: str,
    payload: CreateFilePayload,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    filename = payload.filename.strip()
    
    if not filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Файлын нэр буруу байна.")
        
    content = ""
    if payload.template_type == "checker" or filename == "checker.cpp":
        content = (
            '#include "testlib.h"\n'
            '#include <iostream>\n\n'
            'using namespace std;\n\n'
            'int main(int argc, char* argv[]) {\n'
            '    registerTestlibCmd(argc, argv);\n'
            '    \n'
            '    // ans: зөв хариулт (model output)\n'
            '    // ouf: сурагчийн хариулт (user output)\n'
            '    // inf: бодлогын оролт (input)\n'
            '    \n'
            '    double expected = ans.readDouble();\n'
            '    double candidate = ouf.readDouble();\n'
            '    \n'
            '    if (doubleCompare(expected, candidate, 1e-6)) {\n'
            '        quitf(_ok, "Хариу зөв: Expected %.6f, Found %.6f", expected, candidate);\n'
            '    } else {\n'
            '        quitf(_wa, "Буруу хариу: Expected %.6f, Found %.6f", expected, candidate);\n'
            '    }\n'
            '}\n'
        )
    elif payload.template_type == "generator" or filename == "generator.cpp":
        content = (
            '#include "testlib.h"\n'
            '#include <iostream>\n\n'
            'using namespace std;\n\n'
            'int main(int argc, char* argv[]) {\n'
            '    registerGen(argc, argv, 1);\n'
            '    \n'
            '    int n = opt<int>(1);\n'
            '    int m = opt<int>(2);\n'
            '    \n'
            '    cout << n << " " << m << endl;\n'
            '    return 0;\n'
            '}\n'
        )
        
    def _create():
        existing = _list_draft_files(user_id, code)
        if filename in existing:
            raise ValueError(f"'{filename}' файл аль хэдийнэ үүссэн байна.")
        _write_draft_file(user_id, code, filename, content)
        
    try:
        await anyio.to_thread.run_sync(_create)
        return {"status": "success", "message": f"'{filename}' файл амжилттай үүслээ."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Файл үүсгэхэд алдаа гарлаа: {e}")


@router.delete("/{code}/delete-file", summary="Workspace-оос файл устгах")
async def delete_workspace_file(
    code: str,
    filename: str = Query(...),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    if filename in ("statement.md", "init.yml", "solution.cpp", "generator.cpp"):
        raise HTTPException(status_code=400, detail="Энэхүү системийн файлыг устгах боломжгүй.")
        
    def _delete():
        existing = _list_draft_files(user_id, code)
        if filename not in existing:
            raise ValueError(f"'{filename}' файл олдсонгүй.")
        _delete_draft_file(user_id, code, filename)
        
    try:
        await anyio.to_thread.run_sync(_delete)
        return {"status": "success", "message": f"'{filename}' файл амжилттай устгагдлаа."}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Файл устгахад алдаа гарлаа: {e}")


@router.post("/{code}/upload-image", summary="Workspace-д өгүүлбэрт оруулах зураг/asset хуулах")
async def upload_workspace_image(
    code: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    content_type = file.content_type or "image/png"
    if not (content_type.startswith("image/") or content_type == "application/pdf"):
        raise HTTPException(status_code=400, detail="Зөвхөн зураг эсвэл PDF файл хуулах боломжтой.")
        
    filename = file.filename or "image.png"
    filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
    if not filename:
        filename = "uploaded_image.png"
        
    draft_filename = f"assets/{filename}"
    file_bytes = await file.read()
    
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файлын хэмжээ хамгийн ихдээ 5MB байх ёстой.")
        
    def _upload():
        _write_draft_file_bytes(user_id, code, draft_filename, file_bytes, content_type)
        
    try:
        await anyio.to_thread.run_sync(_upload)
        return {
            "status": "success",
            "filename": filename,
            "relative_path": f"assets/{filename}",
            "message": "Зураг амжилттай хуулагдлаа."
        }
    except Exception as e:
        logger.exception("Failed to upload workspace asset")
        raise HTTPException(status_code=500, detail=f"Файл хуулахад алдаа гарлаа: {e}")


@router.get("/{code}/assets/{filename:path}", summary="Workspace draft доторх зургийг binary-аар үзэх")
async def serve_workspace_asset(
    code: str,
    filename: str,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    draft_filename = f"assets/{filename}"
    
    def _read():
        return _read_draft_file_bytes(user_id, code, draft_filename)
        
    try:
        file_bytes = await anyio.to_thread.run_sync(_read)
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        content_type = "application/octet-stream"
        if ext in ("png", "jpg", "jpeg", "gif", "svg", "webp"):
            content_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
        elif ext == "pdf":
            content_type = "application/pdf"
            
        return Response(content=file_bytes, media_type=content_type)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error serving draft asset {draft_filename}: {e}")
        raise HTTPException(status_code=404, detail="Asset олдсонгүй.")


@router.post("/{code}/test-solution")
async def verify_workspace_solution(
    code: str,
    current_user: User = Depends(require_role("teacher", "admin"))
):
    code = code.upper()
    user_id = str(current_user.id)
    
    def _test():
        # 1. Read solution.cpp
        try:
            solution_code = _read_draft_file(user_id, code, "solution.cpp")
        except Exception:
            raise HTTPException(status_code=400, detail="Model solution (solution.cpp) олдсонгүй.")
            
        # 2. Check if custom checker exists
        checker_code = None
        try:
            checker_code = _read_draft_file(user_id, code, "checker.cpp")
        except Exception:
            pass
            
        # 3. Find all testcases in drafts
        # We can read init.yml first
        flat_cases = []
        try:
            init_content = _read_draft_file(user_id, code, "init.yml")
            from app.api.v1.endpoints.problems import parse_simple_yaml
            init_cfg = parse_simple_yaml(init_content)
            testcases_cfg = init_cfg.get("test_cases", [])
            
            is_nested = len(testcases_cfg) > 0 and "cases" in testcases_cfg[0]
            if is_nested:
                for subtask in testcases_cfg:
                    sub_cases_cfg = subtask.get("cases", [])
                    if isinstance(sub_cases_cfg, list):
                        for tc in sub_cases_cfg:
                            flat_cases.append({
                                "in": tc.get("in"),
                                "out": tc.get("out"),
                                "points": tc.get("points", 10),
                                "sample": tc.get("sample", False)
                            })
            else:
                for tc in testcases_cfg:
                    flat_cases.append({
                        "in": tc.get("in"),
                        "out": tc.get("out"),
                        "points": tc.get("points", 10),
                        "sample": tc.get("sample", False)
                    })
        except Exception:
            # If init.yml parsing fails, fall back to listing cases/ directory in drafts
            pass
            
        # If no cases found via init.yml, let's scan all files in drafts
        if not flat_cases:
            all_files = _list_draft_files(user_id, code)
            in_files = sorted([f for f in all_files if f.startswith("cases/") and f.endswith(".in")])
            for inf in in_files:
                outf = inf[:-3] + ".out"
                if outf in all_files:
                    flat_cases.append({
                        "in": inf,
                        "out": outf,
                        "points": 10,
                        "sample": False
                    })
                    
        if not flat_cases:
            raise HTTPException(status_code=400, detail="Тест кэйсүүд олдсонгүй. Эхлээд тест кэйсүүдийг zip файлаар оруулна уу.")
            
        # Time and memory limits
        time_limit = 1.0
        memory_limit = 64
        try:
            init_content = _read_draft_file(user_id, code, "init.yml")
            from app.api.v1.endpoints.problems import parse_simple_yaml
            init_cfg = parse_simple_yaml(init_content)
            if "time_limit" in init_cfg:
                time_limit = float(init_cfg["time_limit"])
            if "memory_limit" in init_cfg:
                memory_limit = int(init_cfg["memory_limit"])
        except Exception:
            pass

        with tempfile.TemporaryDirectory() as temp_dir:
            # Compile solution.cpp
            sol_src = os.path.join(temp_dir, "solution.cpp")
            sol_bin = os.path.join(temp_dir, "solution.out")
            with open(sol_src, "w", encoding="utf-8") as f:
                f.write(solution_code)
                
            res = subprocess_run(["g++", "-O3", "-std=c++20", sol_src, "-o", sol_bin, "-lm"])
            if res.returncode != 0:
                # Try c++17 if c++20 fails for some reason
                res = subprocess_run(["g++", "-O3", "-std=c++17", sol_src, "-o", sol_bin, "-lm"])
                if res.returncode != 0:
                    return {
                        "status": "CE",
                        "error_log": f"Model Solution компиляцийн алдаа:\n{res.stderr}",
                        "results": []
                    }
                    
            # Compile custom checker if it exists
            checker_bin = None
            if checker_code:
                chk_src = os.path.join(temp_dir, "checker.cpp")
                chk_bin = os.path.join(temp_dir, "checker.out")
                with open(chk_src, "w", encoding="utf-8") as f:
                    f.write(checker_code)
                # Copy testlib.h
                testlib_path = "/usr/include/testlib.h"
                if os.path.exists(testlib_path):
                    shutil.copy(testlib_path, os.path.join(temp_dir, "testlib.h"))
                res = subprocess_run(["g++", "-O3", "-std=c++17", chk_src, "-o", chk_bin])
                if res.returncode == 0:
                    checker_bin = chk_bin
                else:
                    logger.error(f"Draft custom checker compile failed: {res.stderr}")
                    
            # Run testcases
            test_results = []
            overall_status = "AC"
            
            for idx, tc in enumerate(flat_cases, start=1):
                in_file = tc["in"]
                out_file = tc["out"]
                points = tc["points"]
                
                # Read input and expected output content from drafts
                try:
                    in_data = _read_draft_file(user_id, code, in_file)
                    exp_data = _read_draft_file(user_id, code, out_file)
                except Exception as e:
                    test_results.append({
                        "id": idx,
                        "input_file": in_file,
                        "output_file": out_file,
                        "status": "RTE",
                        "time_ms": 0,
                        "memory_kb": 0,
                        "checker_output": f"Тест файлыг уншихад алдаа гарлаа: {str(e)}"
                    })
                    overall_status = "RTE"
                    continue
                    
                # Run local judge subprocess
                from app.services.local_judge import LocalSubprocessJudge
                
                # Run the testcase
                run_cmd = [sol_bin]
                tc_status, execution_time_ms, memory_used_kb, error_log, stdout_data = LocalSubprocessJudge.execute_testcase(
                    run_cmd=run_cmd,
                    input_data=in_data,
                    expected_output=exp_data,
                    time_limit_sec=time_limit,
                    memory_limit_mb=memory_limit,
                    work_dir=temp_dir,
                    checker_bin=checker_bin
                )
                
                if tc_status != "AC" and overall_status == "AC":
                    overall_status = tc_status
                    
                test_results.append({
                    "id": idx,
                    "input_file": in_file,
                    "output_file": out_file,
                    "status": tc_status,
                    "time_ms": round(execution_time_ms, 2),
                    "memory_kb": round(memory_used_kb, 2),
                    "checker_output": error_log or ""
                })
                
            return {
                "status": overall_status,
                "error_log": None,
                "results": test_results
            }
            
    try:
        verdict = await anyio.to_thread.run_sync(_test)
        return verdict
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.exception(f"Error testing draft solution: {e}")
        raise HTTPException(status_code=500, detail=str(e))
