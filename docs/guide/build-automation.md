# Build Automation
Using GitHub Actions, you can automatically build and publish your application to web, desktop, and mobile platforms.

## Desktop
To allow `electron-builder` to publish to a private repository, add the following entry to the relevant `.github/workflows` files:

```yaml
permissions:
  contents: write 
  
```