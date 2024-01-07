# tf-state-worker

⚠ Not yet ready

## Usage

```hcl
terraform {
  backend "http" {
    address = "http://127.0.0.1:8787/states/foo"
    lock_address = "http://127.0.0.1:8787/states/foo"
    unlock_address = "http://127.0.0.1:8787/states/foo"
  }
}
```

### Outputs

```
[wrangler:inf] LOCK /states/foo 200 OK (10ms)
[wrangler:inf] GET /states/foo 404 Not Found (2ms)
[wrangler:inf] GET /states/foo 404 Not Found (2ms)
[wrangler:inf] POST /states/foo 200 OK (4ms)
[wrangler:inf] UNLOCK /states/foo 200 OK (5ms)
```

And with lock supports:

```
❯ terraform apply -auto-approve
╷
│ Error: Error acquiring the state lock
│
│ Error message: HTTP remote state already locked: ID=75ebe9d6-9aed-b789-4832-01ff7411d85f
│ Lock Info:
│   ID:        3797257e-0674-999b-7768-601c7909c844
│   Path:
│   Operation: OperationTypeApply
│   Who:       adrien@DESKTOP-1G3UAF3
│   Version:   1.6.6
│   Created:   2024-01-07 14:46:37.408204138 +0000 UTC
│   Info:
│
│
│ Terraform acquires a state lock to protect the state from being written
│ by multiple users at the same time. Please resolve the issue above and try
│ again. For most commands, you can disable locking with the "-lock=false"
│ flag, but this is not recommended.
```

## Why this and not S3-compatible backend?

## TODO

- [x] Unit Tests
- [ ] e2e tests against a real Terraform
- [ ] Complete README
- [ ] API key Authorization
- [ ] Advanced RBAC
- [ ] Audit logs / Webhooks
- [ ] MD5 of states
