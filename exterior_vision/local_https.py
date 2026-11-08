"""Create short-lived local HTTPS certificates. Never installs trust automatically."""
import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
from pathlib import Path


def create_certificates(host, out):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    address = ipaddress.IPv4Address(host)
    if not (address.is_private or address.is_loopback) or address.is_unspecified:
        raise ValueError('Use a specific private or loopback IP address')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError('Use an empty certificate directory to avoid replacing existing certificates')
    now = datetime.now(timezone.utc)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'FORM Local Camera Test CA')])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
          .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(now-timedelta(minutes=5)).not_valid_after(now+timedelta(days=30))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                         key_encipherment=False, data_encipherment=False, key_agreement=False,
                         key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
          .sign(ca_key, hashes.SHA256()))
    key = ec.generate_private_key(ec.SECP256R1())
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host)]))
            .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now-timedelta(minutes=5)).not_valid_after(now+timedelta(days=7))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(address), x509.DNSName('localhost')]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                           key_encipherment=False, data_encipherment=False, key_agreement=False,
                           key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .sign(ca_key, hashes.SHA256()))
    paths = {name: out/file for name, file in [('cert','server.pem'), ('key','server.key'), ('ca_pem','ca.pem'), ('ca_der','FORM-Local-CA.cer')]}
    paths['cert'].write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    paths['key'].write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    paths['ca_pem'].write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    paths['ca_der'].write_bytes(ca.public_bytes(serialization.Encoding.DER))
    # The CA signing key exists only in memory; only the IP-bound server key persists.
    return paths


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--out', type=Path, default=Path('.tls-exterior'))
    args = parser.parse_args()
    files = create_certificates(args.host, args.out)
    print('Created local TLS certificate and public CA. Install only the .cer on your test phone; keep server.key private.')
