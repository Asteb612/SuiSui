@auth
Feature: Login

  Scenario: Sign in
    Given I am on the "login" page
    When I click on "[type='submit']"
    Then I should see "Welcome"

  @slow
  Scenario Outline: Locked out after <attempts> attempts
    Given I am on the "login" page
    When I fill "[name='password']" with "<password>"
    Then I should see "Locked"

    Examples:
      | attempts | password |
      | 3        | wrong1   |
      | 4        | wrong2   |
      | 5        | wrong3   |
