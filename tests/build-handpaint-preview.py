from pathlib import Path
from PIL import Image

# One-time derivative for fast real-time browser rendering.
# Original source is never overwritten; only the web-friendly copy is made.
Image.MAX_IMAGE_PIXELS = 160_000_000
source = Path('assets/terrain/texturas/terreno_handpaint_10K.png')
target = Path('assets/terrain/texturas/terreno_handpaint_4K.webp')
assert source.is_file(), f'Missing source: {source}'
with Image.open(source) as original:
    assert original.width >= 8000 and original.height >= 8000, 'Expected original 10K painting'
    art = original.convert('RGBA' if 'A' in original.getbands() else 'RGB')
    art.thumbnail((4096, 4096), Image.Resampling.LANCZOS)
    assert max(art.size) == 4096, 'Unexpected GPU derivative resolution'
    art.save(target, 'WEBP', quality=92, method=5, exact=True)
    print(f'Handpaint derivative: {original.size} -> {art.size}; {target.stat().st_size:,} bytes')
assert target.stat().st_size < source.stat().st_size
