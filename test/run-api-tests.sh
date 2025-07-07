#!/bin/bash

# Run Playwright tests with the list reporter and exit immediately
npx playwright test --config=test/playwright.config.ts --project=api-tests --reporter=list --no-open-report

# Exit with the same status code as the test run
exit $?
