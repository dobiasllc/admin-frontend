// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider as OIDCProvider } from "react-oidc-context";
import { AuthProvider as CustomAuthProvider } from './context/AuthContext';
import { Log, WebStorageStateStore } from "oidc-client-ts";

const cognitoAuthConfig = {
  // MUST start with https:// and have a / before the User Pool ID
  authority: `https://cognito-idp.us-east-1.amazonaws.com/${process.env.REACT_APP_COGNITO_USER_POOL_ID}`,
  client_id: process.env.REACT_APP_COGNITO_CLIENT_ID,
  // Use the env var set at build time (= WebsiteURL from CloudFormation, e.g. https://admin.drivedobias.com).
  // This must exactly match one of the CallbackURLs registered in the Cognito User Pool Client.
  redirect_uri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
  response_type: "code",
  scope: "email openid profile",
  metadata: {
    issuer: `https://cognito-idp.us-east-1.amazonaws.com/${process.env.REACT_APP_COGNITO_USER_POOL_ID}`,
    authorization_endpoint: `${process.env.REACT_APP_COGNITO_AUTH_URL}/oauth2/authorize`,
    token_endpoint: `${process.env.REACT_APP_COGNITO_AUTH_URL}/oauth2/token`,
    userinfo_endpoint: `${process.env.REACT_APP_COGNITO_AUTH_URL}/oauth2/userInfo`,
    end_session_endpoint: `${process.env.REACT_APP_COGNITO_AUTH_URL}/logout`,
    // MUST start with https://
    jwks_uri: `https://cognito-idp.us-east-1.amazonaws.com/${process.env.REACT_APP_COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
  },
  // Store session in localStorage so new tabs share the same session
  userStore: new WebStorageStateStore({ store: window.localStorage }),
};

const onSigninCallback = (_user) => {
  const target = localStorage.getItem("post_login_redirect") || "/admin";
  localStorage.removeItem("post_login_redirect");
  window.location.replace(target);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <OIDCProvider {...cognitoAuthConfig} onSigninCallback={onSigninCallback}>
    <CustomAuthProvider>
      <App />
    </CustomAuthProvider>
  </OIDCProvider>
);
