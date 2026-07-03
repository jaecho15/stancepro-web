"""StancePro logo paths for print/marketing generators."""
from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).resolve().parent
MERCH = HERE / "merch"

# Transparent lockup marks — pair with matching card/poster backgrounds.
LOGO_DARK = MERCH / "stancepro_logo_dark_mark_512.png"   # white crystal + light blue hex
LOGO_LIGHT = MERCH / "stancepro_logo_light_mark_512.png"  # blue crystal + navy hex
