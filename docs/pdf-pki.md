# PDF PKI 数字签名（部署配置）

## 目标

当申请完成签署后，下载/预览的 PDF 将带有可验证的数字签名（任何修改都会导致签名失效）。

## 部署环境变量

必填：

- `PDF_PKI_ENABLED=1`
- `PDF_PKI_P12_BASE64=<base64 signer.p12>`
- `PDF_PKI_P12_PASSWORD=<p12 passphrase>`

可选：

- `PDF_PKI_NAME`（签名显示名称）
- `PDF_PKI_REASON`（签名原因）
- `PDF_PKI_LOCATION`（地点）
- `PDF_PKI_CONTACT`（联系信息）
- `PDF_PKI_APP_NAME`（应用名）
- `PDF_PKI_SIGNATURE_LENGTH`（默认 8192）

## 生成证书（自建 CA）

建议：Root CA 离线保存；服务器只放 signer 的 `.p12`。

```bash
PASS='changeit'

openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/C=SG/O=ByBridge/CN=ByBridge Root CA" -out ca.crt

openssl genrsa -out signer.key 2048
openssl req -new -key signer.key -subj "/C=SG/O=ByBridge/CN=ByBridge PDF Signer" -out signer.csr

openssl x509 -req -in signer.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out signer.crt -days 825 -sha256

openssl pkcs12 -export -out signer.p12 -inkey signer.key -in signer.crt -certfile ca.crt -passout pass:$PASS

base64 < signer.p12 | tr -d '\n'
```

## 配置验证

管理员登录后访问：

- `/api/admin/pdf-pki/status`

会返回是否启用、是否缺少变量、以及证书的 subject/issuer/有效期（不返回私钥）。

