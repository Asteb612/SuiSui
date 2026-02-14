Feature: Form Submission

  Scenario: Submit a registration form
    Given I am on the "register" page
    When I fill in the form with the following data:
      | Field      | Value             |
      | First Name | John              |
      | Last Name  | Doe               |
      | Email      | john@example.com  |
    And I click on "[type='submit']"
    Then I should see "Registration successful"
