import asyncio
import io
import os
import zipfile
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.problem import Problem, TestCase
from app.services.storage import storage_client
from app.api.v1.endpoints.problems import parse_simple_yaml

async def seed_sample_problems():
    container_samples = [
        ("TEST_INT", "/app/app/samples/interactive_guessing.zip"),
        ("TEST_CHECK", "/app/app/samples/custom_checker.zip"),
        ("TEST_SIG", "/app/app/samples/ioi_function_signature.zip"),
    ]
    
    async with AsyncSessionLocal() as db:
        for code, zip_path in container_samples:
            if not os.path.exists(zip_path):
                print(f"Skipping {code}: zip file not found at {zip_path}")
                continue
                
            print(f"Seeding {code} from {zip_path}...")
            with open(zip_path, "rb") as f:
                contents = f.read()
                
            with zipfile.ZipFile(io.BytesIO(contents)) as z:
                namelist = z.namelist()
                
                public_statement_path = next((f for f in namelist if f.endswith("public/statement.md")), None)
                private_init_path = next((f for f in namelist if f.endswith("private/init.yml")), None)
                
                if not public_statement_path or not private_init_path:
                    print(f"Error seeding {code}: statement.md or init.yml missing in zip.")
                    continue
                    
                statement_md = z.read(public_statement_path).decode("utf-8")
                init_yml_content = z.read(private_init_path).decode("utf-8")
                init_cfg = parse_simple_yaml(init_yml_content)
                
                time_limit = float(init_cfg.get("time_limit", 1.0))
                memory_limit = int(init_cfg.get("memory_limit", 64))
                
                # 1. Upload public assets to public bucket
                for name in namelist:
                    if "public/" in name and not name.endswith("/"):
                        file_bytes = z.read(name)
                        rel_path = name.split("public/", 1)[1]
                        key = f"{code}/{rel_path}"
                        await storage_client.upload_file(
                            bucket="oj-problems",
                            key=key,
                            data=io.BytesIO(file_bytes),
                            length=len(file_bytes)
                        )
                        
                # 2. Upload private ZIP to private bucket
                private_zip_buffer = io.BytesIO()
                with zipfile.ZipFile(private_zip_buffer, "w", zipfile.ZIP_DEFLATED) as pz:
                    for name in namelist:
                        if "private/" in name and not name.endswith("/"):
                            file_bytes = z.read(name)
                            rel_path = name.split("private/", 1)[1]
                            pz.writestr(rel_path, file_bytes)
                            
                private_zip_bytes = private_zip_buffer.getvalue()
                private_key = f"{code}/cases.zip"
                
                await storage_client.upload_file(
                    bucket="oj-private-problems",
                    key=private_key,
                    data=io.BytesIO(private_zip_bytes),
                    length=len(private_zip_bytes)
                )
                
                # 3. Create or update Problem row
                result = await db.execute(select(Problem).where(Problem.code == code))
                problem = result.scalar_one_or_none()
                
                if not problem:
                    problem = Problem(
                        code=code,
                        title=f"{code} Sample Problem",
                        statement_markdown=statement_md,
                        time_limit=time_limit,
                        memory_limit=memory_limit,
                        testcases_zip_key=f"oj-private-problems/{private_key}",
                        is_visible=True
                    )
                    db.add(problem)
                else:
                    problem.statement_markdown = statement_md
                    problem.time_limit = time_limit
                    problem.memory_limit = memory_limit
                    problem.testcases_zip_key = f"oj-private-problems/{private_key}"
                    problem.is_visible = True
                    
                await db.flush()
                
                # Clear existing test cases
                await db.execute(
                    TestCase.__table__.delete().where(TestCase.problem_id == problem.id)
                )
                
                # Insert sample test cases
                testcases_list = init_cfg.get("test_cases", [])
                order_idx = 1
                for tc in testcases_list:
                    is_sample = str(tc.get("is_sample", "false")).lower() == "true" or str(tc.get("sample", "false")).lower() == "true"
                    in_file = tc.get("in")
                    out_file = tc.get("out")
                    points = int(tc.get("points", 10))
                    
                    input_data = ""
                    output_data = ""
                    
                    if is_sample and in_file and out_file:
                        in_path = next((f for f in namelist if f.endswith(f"private/cases/{in_file}") or f.endswith(f"private/{in_file}")), None)
                        out_path = next((f for f in namelist if f.endswith(f"private/cases/{out_file}") or f.endswith(f"private/{out_file}")), None)
                        if in_path:
                            input_data = z.read(in_path).decode("utf-8")
                        if out_path:
                            output_data = z.read(out_path).decode("utf-8")
                            
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
        print("All sample problems seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_sample_problems())
