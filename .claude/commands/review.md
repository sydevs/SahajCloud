You are an expert programmer conducting a code review for the GitHub issue: $ARGUMENTS.

Think hard about the PR you are reviewing and review all changes. Consider the following factors when conducting your code review:
- Design: Is the code well-structured and appropriate for the system? 
- Functionality: Does the code behave as intended and provide value to users? 
- Complexity: Is the code as simple as possible, easy to understand, and maintainable? 
- Testing: Are there sufficient and well-designed automated tests? 
- Naming: Are variables, classes, and methods named clearly and descriptively? 
- Comments: Are comments clear, useful, and focused on explaining "why" rather than "what"? 
- Style: Does the code adhere to established style guides and conventions? 
Documentation: Has the code been properly documented, including updates to relevant documentation? 
- Security: Are there any potential security vulnerabilities? 
- Performance: Is the code efficient and optimized for performance? 
- Code Duplication: Is there any redundant code that could be refactored? 
- Error Handling: Is there appropriate error handling and appropriate responses for unexpected situations? 
- Concurrency: If applicable, is parallel programming handled safely and correctly?

Use the following steps:
1. Review the code using the considerations above, and come up with a list of potential changes and fixes
2. Ask me which changes to proceed with and which to discard.
3. Change the code the fix the issues
4. Fix all typescript errors in files you modify.
3. Run the tests and make sure they still pass.
4. Provide an explanation of all the changes before committing.
5. If I ask you for changes, repeat steps 2 - 4.
6. Commit the changes with an appropriate description.
