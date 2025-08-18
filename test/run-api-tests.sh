#!/bin/bash

# Run Playwright tests with the list reporter and exit immediately
npx playwright test --config=test/playwright-api.config.ts --project=api-tests --reporter=list

# Exit with the same status code as the test run
exit $?
