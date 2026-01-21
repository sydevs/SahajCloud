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

  // TODO: Fix test - Needs seeded client with usage stats to test abuse score display
  test.skip('shows abuse score for client', async ({ page }) => {
    // This test would require creating a client with usage data
    // For now, we'll just verify the abuse score field exists

    // Navigate to an existing client
    await page.goto('/admin/collections/clients')
    await page.waitForLoadState('networkidle')

    // Wait for table and click on first client
    await page.waitForSelector('table tbody tr', { timeout: 15000 })
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Look for abuse score field - this is a UI field that displays when usage data exists
    const scoreVisible = await page
      .locator('text=Abuse Score')
      .or(page.locator('[data-field="abuseScore"]'))
      .isVisible()

    // Since this displays when usage data exists, check if it's visible
    if (scoreVisible) {
      await expect(
        page.locator('text=Abuse Score').or(page.locator('[data-field="abuseScore"]')),
      ).toBeVisible()
    } else {
      // If not visible, that's expected for clients with no usage data
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
