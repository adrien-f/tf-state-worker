# tf-state-worker

A Cloudflare worker to store and lock Terraform states in R2.

## Why does this exist?

In the case of a new project in a serverless context, without any previous infrastructure (and so, without any Cloud object storage),
it might be interesting to be able to store Terraform states in a remote backend to easily collaborate.

The worker does just that but uses Cloudflare object storage solution, R2.

### But what about the S3 compatibility?

Indeed, it is possible to use the S3 backend to store states in Cloudflare R2 like this:

```hcl
terraform {
  backend "s3" {
    bucket     = "tf-stats"
    key        = "foo.tfstate"
    endpoints  = { s3 = "https://xxx.r2.cloudflarestorage.com" }
    access_key = "xxx"
    secret_key = "xxx"
    region     = "us-east-1"

    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
```

But not only is it verbose (and will never be supported officialy by Hashicorp) but it also does not support locking, which is pretty
useful when working in a team.

### Why the HTTP backend?

It appears that [the remote backend](https://developer.hashicorp.com/terraform/language/settings/backends/remote) also offers something similar
but I can not find any documentation on implementing it and I'm not up to reverse-engineer it for the moment.

The HTTP backend was the simplest one to implement while also supporting locks.

## Installation

You will need a Cloudflare account and an R2 bucket created, then you can run the following commands:

```
npm install
mv wrangler_example.toml wrangler.toml
# edit wrangler.toml to point to your R2 bucket
npx wrangler deploy
```

Note that by default, all requests will fail due to the default authorization method.

You can also execute `npx wrangler dev` to run a local worker and try it before deploying.

## Usage

In your Terraform file:

```hcl
terraform {
  backend "http" {
    address = "http://127.0.0.1:8787/states/foo"
    lock_address = "http://127.0.0.1:8787/states/foo"
    unlock_address = "http://127.0.0.1:8787/states/foo"
  }
}
```

Where `foo` is the name of your state. If you wish to use it for remote states, here's an example:

```hcl
data "terraform_remote_state" "foo" {
  backend = "http"
  config = {
    address = "http://127.0.0.1:8787/states/foo"
  }
}
```

## Authentication

You can configure the authentication method to use. We are limited by what Terraform can send, it can either be Basic Auth header or query string.

Set the `AUTH_PLUGIN` variable to the plugin list and then depending on each plugin, the expected secrets or configuration.

### Fail

Use the value `fail` to deny all operations. This is the default.

### Noop

Use the value `noop` to allow all operations. This is not recommended for security purpose unless you've secured the worker with something else.

### Basic

Use the value `basic` for a simple username/password check. Only one set of credentials is supported for the moment.

To configure this method, also set the secrets `AUTH_BASIC_USERNAME` and `AUTH_BASIC_PASSWORD` variables.

## TODO

- [x] Unit Tests
- [ ] e2e tests against a real Terraform
- [x] Complete README
- [x] Basic Authorization
- [ ] Advanced RBAC
- [ ] Audit logs / Webhooks
- [ ] MD5 of states
