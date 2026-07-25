Feature: Login

  # Runs against the local demo site (site/index.html). Selectors use the
  # data-testid attributes — exactly what SuiSui's Recorder recommends.

  Scenario: Sign in with valid credentials
    Given I am on the "/" page
    When I fill "[data-testid='email-input']" with "arthur@example.com"
    And I fill "[data-testid='password-input']" with "secret123"
    And I click on "[data-testid='login-submit']"
    Then I should see "Welcome"
    And the URL should contain "dashboard"

  Scenario: Reject invalid credentials
    Given I am on the "/" page
    When I fill "[data-testid='email-input']" with "arthur@example.com"
    And I fill "[data-testid='password-input']" with "wrong-password"
    And I click on "[data-testid='login-submit']"
    Then I should see "Invalid credentials"
