# Contributing to @loonylabs/react-native-offline-sync

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/loonylabs-dev/react-native-offline-sync.git
   cd react-native-offline-sync
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Build the package**
   ```bash
   npm run build
   ```

## Development Workflow

1. Create a new branch for your feature/fix
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run tests and linting
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

4. Commit your changes (follow [Conventional Commits](https://www.conventionalcommits.org/))
   ```bash
   git commit -m "feat: add new feature"
   ```

5. Push to your fork and submit a pull request

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Run `npm run lint:fix` to auto-fix style issues
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Testing

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names
- Mock external dependencies

## Pull Request Guidelines

- **Title**: Use conventional commit format (e.g., `feat: add X`, `fix: resolve Y`)
- **Description**: Clearly describe what changes you made and why
- **Tests**: Include tests for new features
- **Documentation**: Update README/docs if needed
- **Breaking Changes**: Clearly mark and explain breaking changes

## Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: add custom conflict resolver support
fix: resolve race condition in sync queue
docs: update API documentation
test: add tests for PushSynchronizer
```

## Reporting Issues

When reporting issues, please include:

- **Description**: Clear description of the issue
- **Steps to Reproduce**: Detailed steps to reproduce the problem
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Environment**: OS, Node version, React Native version, etc.
- **Code Sample**: Minimal code example that reproduces the issue

## Feature Requests

We welcome feature requests! Please:

- Check if the feature already exists or is planned
- Clearly describe the use case
- Explain why this feature would be useful
- Provide examples if possible

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue for any questions or concerns.
