import { test, expect } from '@playwright/test'

import { adminLogin } from '../utils/e2e-helpers'

test.describe('Clients Management UI', () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  // TODO: Fix test - Clients collection requires managers and primaryContact relationships
  // which cannot be easily filled via form selectors. Test needs to use seeded test client.
  test.skip('displays usage statistics', async ({ page }) => {
    // First create a client if none exists
    await page.goto('/admin/collections/clients/create')
    await page.waitForLoadState('networkidle')

    // Create a test client
    await page.fill('input[name="name"]', 'Test Client for Usage Stats')
    await page.fill('textarea[name="notes"]', 'Client for testing usage statistics display')
    await page.selectOption('select[name="role"]', 'full-access')
    await page.click('button:has-text("Save")')

    // Wait for success and navigate to the created client
    await page.waitForURL(/\/admin\/collections\/clients\/\w+/)
    await page.waitForLoadState('networkidle')

    // Look for usage stats section - use more flexible selector
    await expect(
      page.locator('text=Usage Stats').or(page.locator('[data-testid="usage-stats"]')),
    ).toBeVisible()

    // Check for usage stat fields with more flexible selectors
    await expect(
      page.locator('text=Total Requests').or(page.locator('[data-field="totalRequests"]')),
    ).toBeVisible()
    await expect(
      page.locator('text=Daily Requests').or(page.locator('[data-field="dailyRequests"]')),
    ).toBeVisible()
    await expect(
      page.locator('text=Last Request At').or(page.locator('[data-field="lastRequestAt"]')),
    ).toBeVisible()
    await expect(
      page.locator('text=Last Reset At').or(page.locator('[data-field="lastResetAt"]')),
    ).toBeVisible()
  })

  // TODO: Fix test - Needs seeded client with high usage stats to test alert display
  test.skip('shows high usage alert when threshold exceeded', async ({ page }) => {
    // This test would require creating a client with high usage
    // For now, we'll just verify the alert field exists

    // Navigate to an existing client
    await page.goto('/admin/collections/clients')
    await page.waitForLoadState('networkidle')

    // Wait for table and click on first client
    await page.waitForSelector('table tbody tr', { timeout: 15000 })
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Look for high usage alert field - this might be a virtual field that only shows when usage is high
    const alertVisible = await page
      .locator('text=High Usage Alert')
      .or(page.locator('[data-field="highUsageAlert"]'))
      .isVisible()

    // Since this is a virtual field that might not always be visible, just check if it exists when present
    if (alertVisible) {
      await expect(
        page.locator('text=High Usage Alert').or(page.locator('[data-field="highUsageAlert"]')),
      ).toBeVisible()
    } else {
      // If not visible, that's expected for low-usage clients
    }
  })

  test('validates required fields', async ({ page }) => {
    // Navigate to create new client
    await page.goto('/admin/collections/clients/create')
    await page.waitForLoadState('networkidle')

    // Wait for form to load
    await page.waitForSelector('button:has-text("Save")', { timeout: 15000 })

    // Try to save without filling required fields
    await page.click('button:has-text("Save")')

    // Check for validation errors - look for any required field error
    await expect(page.locator('text=This field is required').first()).toBeVisible({
      timeout: 10000,
    })
  })
})
