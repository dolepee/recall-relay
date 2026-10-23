"""Install the documented local runtime and checksum-verified pinned model."""
import argparse
import hashlib
import json
import platform
import subprocess
import sys
import urllib.request
import venv
from pathlib import Path

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'scripts/ai-model-manifest.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--verify-only', action='store_true', help='Check model hashes; do not install or download anything.')
args = parser.parse_args()
target = root / '.local/ai-model'

def digest(path):
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

if not args.verify_only:
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        sys.exit('This local AI package requires an Apple Silicon Mac. No installation was attempted.')
    if sys.version_info < (3, 11):
        sys.exit('Python 3.11 or newer is required.')
    runtime = root / '.local/ai-venv'
    if not (runtime / 'bin/python').exists():
        venv.create(runtime, with_pip=True)
    subprocess.run([str(runtime / 'bin/python'), '-m', 'pip', 'install',
                    'mlx==0.32.4', 'mlx-lm==0.32.2'], check=True)
    target.mkdir(parents=True, exist_ok=True)
    (target / 'verified-download.json').unlink(missing_ok=True)

for name, expected in manifest['files'].items():
    path = target / name
    if digest(path) == expected:
        print('Verified ' + name, flush=True)
        continue
    if args.verify_only:
        sys.exit('Missing or incorrect model file: ' + name)
    print('Downloading ' + name + ' from pinned Hugging Face revision', flush=True)
    partial = path.with_suffix(path.suffix + '.download')
    offset = partial.stat().st_size if partial.exists() else 0
    request = urllib.request.Request(manifest['baseUrl'] + '/' + name,
                                     headers={'Range': 'bytes=' + str(offset) + '-'} if offset else {})
    with urllib.request.urlopen(request, timeout=60) as response:
        resumed = offset > 0 and response.status == 206
        if resumed and not response.headers.get('Content-Range', '').startswith('bytes ' + str(offset) + '-'):
            sys.exit('Unexpected resume range; no model was activated.')
        with partial.open('ab' if resumed else 'wb') as f:
            while chunk := response.read(1024 * 1024):
                f.write(chunk)
    if digest(partial) != expected:
        sys.exit('Checksum mismatch: ' + name + '. Partial data was retained; no model was activated.')
    partial.replace(path)
    print('Verified ' + name, flush=True)

if not args.verify_only:
    (target / 'verified-download.json').write_text(json.dumps({
        'sha256': manifest['files']['model.safetensors'],
        'revision': manifest['revision'], 'filesVerified': len(manifest['files'])}) + '\n')
print('All pinned model files verified. No payment credentials were used.')
