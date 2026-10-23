"""Local-only JSONL inference worker. No network or payment credentials."""
import json
import sys
from pathlib import Path

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

root = Path(__file__).resolve().parents[1] / '.local' / 'ai-model'
if not (root / 'verified-download.json').exists():
    raise SystemExit('The pinned model download has not been verified.')
model, tokenizer = load(str(root))
for line in sys.stdin:
    try:
        request = json.loads(line)
        messages = [{'role': 'system', 'content': request['system']},
                    {'role': 'user', 'content': request['input']}]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        result = generate(model, tokenizer, prompt=prompt, max_tokens=900,
                          sampler=make_sampler(temp=0), verbose=False)
        print(json.dumps({'id': request['id'], 'text': result}), flush=True)
    except Exception:
        print(json.dumps({'id': request.get('id'), 'error': 'Local inference failed; no draft applied.'}), flush=True)
