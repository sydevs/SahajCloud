import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('can go on homepage', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/We Meditate Admin/)

    const heading = page.locator('h1').first()

    await expect(heading).toHaveText('We Meditate Admin')
  })
})
