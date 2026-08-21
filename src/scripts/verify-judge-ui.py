import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
import json
import os

SCREENSHOTS = Path("/tmp/browser/judge-persistence/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        
        # 1. Sign in
        page = await context.new_page()
        # Using the dashboard as origin for auth injection
        await page.goto("http://localhost:8080/dashboard")
        
        # Restore session from env (provided by Lovable)
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )
        
        # 2. Go to Judge Mode
        await page.goto("http://localhost:8080/judge")
        await page.wait_for_selector("text=Deterministic end-to-end transaction")
        
        # 3. Verify it loaded the latest run automatically (based on previous audit, one exists)
        await page.wait_for_timeout(2000) # Wait for TanStack Query
        await page.screenshot(path=str(SCREENSHOTS / "1_initial_load.png"))
        
        # Check if steps are visible
        steps_visible = await page.locator("li:has-text('1.')").count()
        print(f"Steps visible on initial load: {steps_visible}")

        # 4. Navigate away
        await page.get_by_role("link", name="Dashboard").click()
        await page.wait_for_url("**/dashboard")
        await page.screenshot(path=str(SCREENSHOTS / "2_navigated_away.png"))
        
        # 5. Navigate back
        await page.goto("http://localhost:8080/judge")
        await page.wait_for_selector("text=Deterministic end-to-end transaction")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SCREENSHOTS / "3_navigated_back.png"))
        
        steps_visible_after = await page.locator("li:has-text('1.')").count()
        print(f"Steps visible after navigation: {steps_visible_after}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
