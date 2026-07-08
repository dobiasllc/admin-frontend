#!/bin/bash
# deploy_client.sh
# Builds and deploys the admin-frontend to the /admin/ prefix of the same
# S3 bucket + CloudFront distribution used by web-frontend.
#
# This keeps both apps on the same AWS resources (zero extra cost) while
# keeping the codebases fully separated.  When you're ready to split the
# admin into its own SaaS deployment, just point FLEET_STACK at a new stack
# and remove the ADMIN_PREFIX.
#
# Usage:
#   ./deploy_client.sh                    # deploys against prod fleet stack (default)
#   FLEET_STAGE=prod ./deploy_client.sh   # explicit prod
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - npm installed
#   - fleet-management-prod stack deployed (aws-infra-backend/deploy_infra.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
FLEET_STAGE="${FLEET_STAGE:-prod}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ADMIN_PREFIX="admin"   # files land at s3://bucket/admin/...

FLEET_STACK="fleet-management-${FLEET_STAGE}"

echo "🔍 Fetching configuration from CloudFormation stack..."
echo "   Fleet stack: $FLEET_STACK (stage: $FLEET_STAGE)"

# Helper: fetch a single CloudFormation output value
get_output() {
  local stack_name="$1"
  local output_key="$2"
  local value
  value=$(aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
    --output text \
    --no-cli-pager 2>/dev/null)
  if [[ -z "$value" || "$value" == "None" ]]; then
    echo "❌ ERROR: Could not find output '$output_key' in stack '$stack_name'" >&2
    echo "   Make sure the stack is deployed and the output key is correct." >&2
    exit 1
  fi
  echo "$value"
}

# ── All outputs come from the same unified fleet-management stack ─────────────
BUCKET_NAME=$(get_output "$FLEET_STACK" "WebsiteBucketName")
DISTRIBUTION_ID=$(get_output "$FLEET_STACK" "CloudFrontDistributionId")
COGNITO_DOMAIN=$(get_output "$FLEET_STACK" "CognitoAuthUrl")
COGNITO_CLIENT_ID=$(get_output "$FLEET_STACK" "UserPoolClientIdOutput")
COGNITO_USER_POOL_ID=$(get_output "$FLEET_STACK" "UserPoolId")
WEBSITE_URL=$(get_output "$FLEET_STACK" "WebsiteURL")
API_GATEWAY_URL=$(get_output "$FLEET_STACK" "ApiBaseUrl")

# Admin app lives at /admin relative to the site root
ADMIN_URL="${WEBSITE_URL%/}/admin"
# Cognito redirect URI must match what's registered in the User Pool App Client
ADMIN_REDIRECT_URI="${ADMIN_URL}"

echo ""
echo "   ✅ Config resolved:"
echo "      API URL       : $API_GATEWAY_URL"
echo "      Admin URL     : $ADMIN_URL"
echo "      S3 Bucket     : $BUCKET_NAME (prefix: /$ADMIN_PREFIX/)"
echo "      CloudFront ID : $DISTRIBUTION_ID"
echo "      Cognito Pool  : $COGNITO_USER_POOL_ID"
echo ""

# ── React build ───────────────────────────────────────────────────────────────
echo "🛠️  Building admin-frontend..."
cd "$SCRIPT_DIR"

REACT_APP_COGNITO_AUTH_URL="$COGNITO_DOMAIN" \
REACT_APP_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
REACT_APP_REDIRECT_URI="$ADMIN_REDIRECT_URI" \
REACT_APP_COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
REACT_APP_API_GATEWAY_URL="$API_GATEWAY_URL" \
REACT_APP_FLEET_STAGE="$FLEET_STAGE" \
npm run build

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "❌ Build folder not found: $BUILD_DIR"
  exit 1
fi

# ── Upload to S3 under /admin/ prefix ─────────────────────────────────────────
echo "🚀 Uploading to S3: s3://$BUCKET_NAME/$ADMIN_PREFIX/"

# Static assets — long-lived cache (content-hashed filenames)
aws s3 sync "$BUILD_DIR" "s3://$BUCKET_NAME/$ADMIN_PREFIX/" \
  --delete \
  --region "$REGION" \
  --exclude "index.html"

# index.html — never cache so browsers always get the latest shell
aws s3 cp "$BUILD_DIR/index.html" "s3://$BUCKET_NAME/$ADMIN_PREFIX/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --region "$REGION"

# ── Invalidate CloudFront cache for /admin/* ──────────────────────────────────
echo "🔄 Invalidating CloudFront cache: /$ADMIN_PREFIX/*"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/$ADMIN_PREFIX/*" \
  --no-cli-pager

echo ""
echo "✅ Admin frontend deployed successfully."
echo "   Live at: $ADMIN_URL"
echo ""
echo "📋 CloudFront reminder:"
echo "   Make sure your distribution has a behavior for /$ADMIN_PREFIX/*"
echo "   that returns /admin/index.html for 403/404 errors (SPA routing)."
