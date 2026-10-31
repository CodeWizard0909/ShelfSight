"""Turn raw agent results into shelf status, alerts and a scorecard."""
import re

from config import PINCODES, PLATFORMS


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _products(result) -> list[dict]:
    if not isinstance(result, dict):
        return []
    if isinstance(result.get("products"), list):
        return result["products"]
    inner = result.get("result")
    if isinstance(inner, dict) and isinstance(inner.get("products"), list):
        return inner["products"]
    return []


BLOCK_SIGNS = ("blocked", "timed out", "access denied", "login wall", "not serviceable",
               "couldn't set the delivery location", "no products returned", "wouldn't load")


def is_blocked(error: str | None) -> bool:
    """The site stopped the agent (bot wall, login wall, time cap). Not worth an automatic retry."""
    return bool(error) and any(s in error.lower() for s in BLOCK_SIGNS)


def analyse_cell(brand: str, platform: str, pincode: str, result, error: str | None = None) -> dict:
    cell = {"platform": platform, "pincode": pincode, "status": "error", "error": error}
    if error:
        if is_blocked(error):
            cell["status"] = "blocked"
            cell["error"] = "Hit the time cap" if "timed out" in error.lower() else error
        return cell

    products = _products(result)
    if products and isinstance(result, dict) and result.get("location_set") is False:
        cell.update(status="blocked", error="Couldn't set the delivery location, so results aren't area-specific")
        return cell
    b = _norm(brand)
    mine = [p for p in products if b and (b in _norm(p.get("brand")) or b in _norm(p.get("name")))]
    others = [p for p in products if p not in mine]

    if not products:
        cell["status"] = "error"
        not_serviceable = isinstance(result, dict) and result.get("location_set") is False
        cell["error"] = "Pincode not serviceable" if not_serviceable else "No products extracted"
        return cell

    if not mine:
        status = "not_listed"
    elif any(p.get("in_stock") for p in mine):
        status = "in_stock"
    else:
        status = "out_of_stock"

    best_rank = min((p.get("rank") or 99) for p in mine) if mine else None
    top = min(products, key=lambda p: p.get("rank") or 99)
    discounts = [
        round(100 * (1 - p["price"] / p["mrp"]))
        for p in mine
        if p.get("price") and p.get("mrp") and p["mrp"] > 0
    ]

    cell.update(
        status=status,
        error=None,
        my_count=len(mine),
        my_in_stock=sum(1 for p in mine if p.get("in_stock")),
        best_rank=best_rank,
        top_product=top,
        top_is_competitor=top not in mine,
        competitors=sorted({p.get("brand") for p in others if p.get("brand")}),
        max_discount=max(discounts) if discounts else 0,
        eta=(result or {}).get("delivery_eta_minutes") if isinstance(result, dict) else None,
        products=products,
    )
    return cell


def alerts_for(brand: str, cell: dict) -> list[dict]:
    area = PINCODES.get(cell["pincode"], ("?",))[0]
    plat = PLATFORMS[cell["platform"]]["name"]
    where = f"{plat} · {area} ({cell['pincode']})"
    out = []
    if cell["status"] == "blocked":
        return [{"level": "info", "where": where, "text": f"{plat} stopped our agent here ({cell['error']}). Shelf unknown."}]
    if cell["status"] == "out_of_stock":
        out.append({"level": "critical", "where": where, "text": f"{brand} is OUT OF STOCK. Shoppers here see only competitors."})
    elif cell["status"] == "not_listed":
        out.append({"level": "critical", "where": where, "text": f"{brand} is NOT LISTED in search results."})
    if cell.get("top_is_competitor") and cell["status"] != "error":
        t = cell["top_product"]
        out.append({"level": "warning", "where": where, "text": f"Competitor {t.get('brand')} ranks #1 on your search term ({t.get('name')})."})
    if cell.get("max_discount", 0) >= 35:
        out.append({"level": "info", "where": where, "text": f"{brand} discounted {cell['max_discount']}% below MRP. Check margin leakage."})
    return out


def scorecard(cells: list[dict]) -> dict:
    done = [c for c in cells if c["status"] not in ("error", "blocked")]
    if not done:
        return {"availability": 0, "rank1_share": 0, "scanned": 0}
    avail = sum(1 for c in done if c["status"] == "in_stock")
    rank1 = sum(1 for c in done if c.get("best_rank") == 1)
    return {
        "availability": round(100 * avail / len(done)),
        "rank1_share": round(100 * rank1 / len(done)),
        "scanned": len(done),
    }
