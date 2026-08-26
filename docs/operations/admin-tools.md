# Admin tools bootstrap and credential rotation

NPM, pgAdmin, Open WebUI нь платформын сурагчийн урсгалын dependency биш. Тэдгээрийг
зөвхөн шаардлагатай үед `ops` эсвэл `admin-tools` profile-оор асааж, admin UI-д
localhost, SSH tunnel эсвэл VPN-ээр хандана. NPM-ээс бусад сервис public host port
нээхгүй.

## Нэн түрүүнд хийх incident action: Git-д орсон NPM state

`config/npm/data` доторх SQLite DB, JWT key material, proxy configuration болон
access/error log Git-д track хийгдсэн байсан. Энэ repository-г үзэх эрхтэй хүн бүр
тэдгээрийг уншсан байж болзошгүй гэж үзнэ. Ignore rule нь зөвхөн дахин commit
хийхээс хамгаалах бөгөөд өмнөх commit/history-г цэвэрлэхгүй.

1. Repository болон server-ийн access-ийг хянаж, одоогийн NPM state-ийн encrypted
   off-host forensic backup авна. Backup-д access-ийг incident owner-оор хязгаарлана.
2. `git rm -r --cached config/npm/data config/npm/letsencrypt` ажиллуулж index-ээс
   салгаад commit хийнэ. Энэ command working copy-г устгахгүй.
3. Repository аль хэдийн remote/shared болсон бол history rewrite ба force-push-ийг
   бүх clone/branch/tag owner-той төлөвлөж гүйцэтгэнэ. Rewrite дууслаа гээд key
   аюулгүй болсон гэж үзэхгүй.
4. NPM admin password, JWT keys, access-list credential болон repository-д байсан
   certificate/private key-г бүгдийг compromised гэж үзэн солино. Certificate-г
   reissue/revoke хийх шаардлагыг CA болон домэйн тус бүрээр шалгана.
5. Хуучин SQLite/`keys.json`-г production named volume руу шууд хуулалгүй, fresh
   NPM instance дээр reviewed proxy host/access list-ээ дахин үүсгэнэ. DNS/TLS
   cutover-ийн дараа хуучин state-г retention policy-ийн дагуу устгана.

## NPM fresh bootstrap

Steady-state `npm` нь `ops` profile-д, public 80/443 болон localhost-only 81 дээр
ажиллана. Fresh install default admin credential үүсгэх эрсдэлтэй тул эхний
асаалтыг бүх портыг loopback болгосон override-оор хийнэ:

```sh
docker compose \
  -f docker-compose.yml \
  -f docker-compose.admin-bootstrap.yml \
  --profile ops up -d npm
```

1. Server дээр `http://127.0.0.1:81` рүү шууд эсвэл SSH tunnel-ээр орно.
2. Pinned NPM 2.15 fresh volume дээр legacy `admin@example.com/changeme` байхгүй,
   initial setup wizard гарна. Unique email/password-тай first admin-ийг зөвхөн энэ
   loopback window-д үүсгэнэ; API initial setup дууссан, legacy/wrong credential
   reject болж буйг шалгана. Хуучин хувилбар/default credential харагдвал public
   80/443 руу шилжүүлэхгүй.
3. Шаардлагатай proxy hosts, access lists, TLS certificate-г fresh state дээр
   үүсгэнэ. NPM admin endpoint-ийг proxy host болгон public гаргахгүй.
4. NPM-г зогсоож, bootstrap override-гүй `--profile ops` горимоор recreate хийнэ.
5. Гаднаас 80/443 ажиллаж, 81 хаалттай; server localhost/VPN-аас 81 ажиллаж буйг
   батална.

## pgAdmin

Production override нь email-ийг `PGADMIN_DEFAULT_EMAIL`, password-ийг
`OJ_SECRET_DIR/pgadmin_default_password` Docker secret file-аас уншина. Secret file
нь newline-ээр төгсөж болох боловч хоосон байж болохгүй. Compose local-file secret
нь bind mount тул container-ийн `uid=5050` унших эрхтэй байх ёстой: parent directory
`0700`, file-г `uid=5050` owner-той `0400` болгох, эсвэл хамгаалалттай `0700`
directory дотор `0444` болгоно. `0600`, host deployment user owner-той file нь
pgAdmin-д уншигдахгүй бөгөөд startup fail-closed зогсоно.
pgAdmin нь persistent named volume ашиглаж, зөвхөн `127.0.0.1:5050` дээр сонсоно.

```sh
docker compose \
  -f docker-compose.yml \
  -f docker-compose.secrets.yml \
  --profile admin-tools up -d pgadmin
```

Fresh volume дээр secret credential accepted, буруу password rejected, restart
дараа server registration хадгалагдсан эсэхийг шалгана. Password rotate хийхдээ
эхлээд UI account password-г солино; дараа нь secret file-г atomic replace хийж,
fresh/bootstrap хэрэгцээнд шинэ утгыг хадгална. UI ба bootstrap secret зөрүүтэй
байж болохыг change record-д тэмдэглэнэ.

## Open WebUI

Open WebUI зөвхөн `admin-tools` profile болон `127.0.0.1:3001` дээр ажиллана.
Compose нь хоосон `WEBUI_SECRET_KEY` inject хийхгүй: local entrypoint 32 random byte
signing key-г `openwebuidata/.webui_secret_key`-д `0600` mode-оор үүсгэж, official
`WEBUI_SECRET_KEY_FILE` contract-аар уншуулна. `OPEN_WEBUI_CORS_ORIGINS`-ийг бодит
admin URL болгоно; default нь localhost bootstrap URL. Volume-г backup-гүй устгавал account,
chat, persistent config болон signing key алдагдана.

Default SentenceTransformers нь fresh startup дээр Hugging Face model автоматаар
татдаг тул Compose RAG embedding engine-ийг internal Ollama руу чиглүүлсэн. Эхлээд
`OPEN_WEBUI_EMBEDDING_MODEL`-д заасан model-ийг Ollama-д татаж checksum/size-г
батална; model байхгүй үед chat асч болох ч document/RAG ажиллагааг ready гэж
үзэхгүй. Open WebUI нь нэг replica, `UVICORN_WORKERS=1` байна.

1. Эхний удаа localhost/SSH tunnel-ээр `http://127.0.0.1:3001` нээнэ.
2. Бусдад порт хүрэх боломжгүйг баталсны дараа эхний account-ыг үүсгэн admin
   болсныг шалгана.
3. Admin settings дээр public signup-ийг хааж, шинэ anonymous signup rejected
   болохыг private browser session-аар шалгана. `ENABLE_SIGNUP` нь DB-д persistent
   config тул зөвхөн environment сольсонд найдахгүй.
4. Signing key rotate хийвэл бүх session хүчингүй болохыг change window-д тооцно.

## Release gate

- Host/LAN scan: public зөвхөн 80/443; 81, 3001, 5050 unreachable.
- Localhost/VPN: admin endpoints reachable, TLS/SSH tunnel policy мөрдөгдөнө.
- Default/old/wrong credential rejected; current credential accepted.
- Container restart дараа account/config хадгалагдсан.
- `docker inspect` environment-д password/secret plaintext байхгүй.
- NPM named volumes болон pgAdmin/Open WebUI volume backup/restore scope-д орсон.
