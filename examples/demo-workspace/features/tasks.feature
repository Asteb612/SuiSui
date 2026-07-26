Feature: Task management

  Background:
    Given I am on the "/" page
    When I fill "[data-testid='email-input']" with "arthur@example.com"
    And I fill "[data-testid='password-input']" with "secret123"
    And I click on "[data-testid='login-submit']"
    Then I should see "Welcome"

  Scenario: Add a task to the list
    When I fill "[data-testid='task-title']" with "Write the demo scenario"
    And I select "High" from "[data-testid='task-priority']"
    And I click on "[data-testid='add-task']"
    Then the element "[data-testid='task-list']" should contain the text "Write the demo scenario"
    And there should be 1 "[data-testid='task-item']" elements

  Scenario: Mark a task as urgent
    When I fill "[data-testid='task-title']" with "Ship the release"
    And I check "[data-testid='task-urgent']"
    And I click on "[data-testid='add-task']"
    Then the element "[data-testid='task-list']" should contain the text "Ship the release — Low (urgent)"

  Scenario: Scenario base 1
    Given I am on the "http://localhost:5173/" page
    When I click on '[data-testid="email-input"]'
    When I fill '[data-testid="email-input"]' with "arthur@exemple.fr"
    When I press "Tab"
    When I fill '[data-testid="password-input"]' with "${PASSWORD}"
    When I click on '[data-testid="task-title"]'
    When I click on '[data-testid="task-title"]'
    When I fill '[data-testid="task-title"]' with "Coucou"
    When I select "High" from '[data-testid="task-priority"]'
    When I click on 'internal:label="Priority"i'
    When I click on '[data-testid="add-task"]'
