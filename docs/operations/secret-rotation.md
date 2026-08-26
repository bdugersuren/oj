# Production secret rotation runbook

Энэ runbook-ийг backup/restore drill амжилттай болсон staging орчинд эхэлж
ажиллуулна. Secret утгыг command line argument, Git, CI log эсвэл container
environment-д дамжуулахгүй; `OJ_SECRET_DIR` дахь `0600` file ашиглана.

## JWT болон encryption key-г анх салгах

Хуучин хувилбар DB-ийн `smtp_password`-ийг `SECRET_KEY`-ээр шифрлэсэн. Иймээс
эхний deployment дээр:

1. Одоогийн `secret_key` file-ийн backup-ийг эрх хязгаарласан off-host байрлалд авна.
2. `encryption_key` file-д одоогийн `secret_key`-ийн **ижил утгыг** байрлуулна.
3. `docker-compose.secrets.yml` override-той API/Celery-г restart хийнэ.
4. SMTP тохиргоо decrypt болж, test mail явж байгааг батална.
5. Шинэ random `secret_key` үүсгээд API/Celery-г дахин restart хийнэ.
6. Өмнөх access JWT хүчингүй, шинэ login/access token ажиллаж, DB-ийн SMTP
   credential хэвээр decrypt болж байгааг батална. Refresh token-ийг server-side
   revoke хийх эсэхийг incident/change scope-оор шийднэ.

Энэ дараалалд `encryption_key` өөрчлөгдөхгүй тул DB ciphertext migration хийхгүй.

## Encryption key rotate хийх

1. PostgreSQL backup авч restore боломжтойг батална.
2. Одоогийн `encryption_key`-г `encryption_key_previous` file болгон хадгална.
3. Шинэ random утгыг `encryption_key` file-д atomic rename-аар байрлуулна.
4. Түр хугацаанд дараах гурван Compose файлыг хамт ашиглан API/Celery-г restart:

   ```sh
   docker compose \
     -f docker-compose.yml \
     -f docker-compose.secrets.yml \
     -f docker-compose.encryption-rotation.yml \
     up -d api celery
   ```

5. Ciphertext-ийг шинэ key-р дахин шифрлэнэ:

   ```sh
   docker compose \
     -f docker-compose.yml \
     -f docker-compose.secrets.yml \
     -f docker-compose.encryption-rotation.yml \
     run --rm api python -m scripts.rotate_encrypted_settings
   ```

6. Test mail болон API readiness-ийг шалгана.
7. `docker-compose.encryption-rotation.yml`-ийг command-аас хасаж API/Celery-г
   recreate хийнэ. `encryption_key_previous`-ийг active server-ээс устгана.
8. Хуучин key-гүйгээр SMTP decrypt/test mail амжилттайг дахин батална.

Migration command decrypt хийж чадахгүй, current/previous key ижил, эсвэл шинэ
ciphertext үүсээгүй үед DB commit хийхгүй fail-closed зогсоно.

## PostgreSQL ба MinIO

Автомат staging drill:

```sh
backend/scripts/smoke_secret_rotation.sh
```

Энэ нь тусдаа Compose project/volume дээр forward rotation, superseded credential
rejection, marker-data preservation, rollback болон эсрэг credential rejection-ийг
шалгаад бүх түр resource/secret-ээ устгана.
