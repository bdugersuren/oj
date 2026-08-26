"""Credential rotation assertions used by the isolated Compose smoke drill."""
import argparse
from io import BytesIO
from pathlib import Path

import psycopg2
from minio import Minio
from minio.error import S3Error
from psycopg2 import OperationalError, sql


MARKER = b"oj-secret-rotation-marker-v1"
BUCKET = "rotation-smoke"
OBJECT = "marker.txt"


def secret(directory: str, name: str) -> str:
    value = (Path(directory) / name).read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError(f"Empty smoke credential: {name}")
    return value


def db_connect(directory: str):
    return psycopg2.connect(
        host="db",
        port=5432,
        dbname="oj_db",
        user="oj_user",
        password=secret(directory, "postgres_password"),
        connect_timeout=5,
    )


def db_rotate(current: str, replacement: str) -> None:
    with db_connect(current) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS secret_rotation_smoke "
                "(id integer PRIMARY KEY, marker text NOT NULL)"
            )
            cursor.execute(
                "INSERT INTO secret_rotation_smoke (id, marker) VALUES (1, %s) "
                "ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker",
                (MARKER.decode(),),
            )
            cursor.execute(
                sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                    sql.Identifier("oj_user"),
                    sql.Literal(secret(replacement, "postgres_password")),
                )
            )
    print("postgres password rotated")


def db_verify(directory: str) -> None:
    with db_connect(directory) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT marker FROM secret_rotation_smoke WHERE id = 1")
            row = cursor.fetchone()
    if row != (MARKER.decode(),):
        raise AssertionError(f"PostgreSQL marker mismatch: {row!r}")
    print("postgres credential accepted and marker preserved")


def db_rejected(directory: str) -> None:
    try:
        connection = db_connect(directory)
    except OperationalError:
        print("superseded postgres credential rejected")
        return
    connection.close()
    raise AssertionError("Old PostgreSQL credential is still accepted")


def minio_client(directory: str) -> Minio:
    return Minio(
        "minio:9000",
        access_key=secret(directory, "minio_root_user"),
        secret_key=secret(directory, "minio_root_password"),
        secure=False,
    )


def minio_put(directory: str) -> None:
    client = minio_client(directory)
    if not client.bucket_exists(BUCKET):
        client.make_bucket(BUCKET)
    client.put_object(BUCKET, OBJECT, BytesIO(MARKER), len(MARKER))
    print("minio marker created")


def minio_verify(directory: str) -> None:
    response = minio_client(directory).get_object(BUCKET, OBJECT)
    try:
        value = response.read()
    finally:
        response.close()
        response.release_conn()
    if value != MARKER:
        raise AssertionError(f"MinIO marker mismatch: {value!r}")
    print("minio credential accepted and marker preserved")


def minio_rejected(directory: str) -> None:
    try:
        minio_client(directory).list_buckets()
    except S3Error as exc:
        if exc.code in {"AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            print("superseded minio credential rejected")
            return
        raise
    raise AssertionError("Old MinIO credential is still accepted")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=(
            "db-rotate", "db-verify", "db-rejected",
            "minio-put", "minio-verify", "minio-rejected",
        ),
    )
    parser.add_argument("credential_dir")
    parser.add_argument("replacement_dir", nargs="?")
    args = parser.parse_args()

    if args.action == "db-rotate":
        if not args.replacement_dir:
            parser.error("db-rotate requires replacement_dir")
        db_rotate(args.credential_dir, args.replacement_dir)
    elif args.action == "db-verify":
        db_verify(args.credential_dir)
    elif args.action == "db-rejected":
        db_rejected(args.credential_dir)
    elif args.action == "minio-put":
        minio_put(args.credential_dir)
    elif args.action == "minio-verify":
        minio_verify(args.credential_dir)
    else:
        minio_rejected(args.credential_dir)


if __name__ == "__main__":
    main()
