Feature: Login

  Scenario: Successful login
    Given I am on the "login" page
    When I fill "[name='username']" with "admin"
    And I fill "[name='password']" with "secret"
    And I click on "[type='submit']"
    Then I should see "Welcome"
    And the URL should contain "/dashboard"

  Scenario: Failed login
    Given I am on the "login" page
    When I fill "[name='username']" with "invalid"
    And I fill "[name='password']" with "wrong"
    And I click on "[type='submit']"
    Then I should see "Invalid credentials"
