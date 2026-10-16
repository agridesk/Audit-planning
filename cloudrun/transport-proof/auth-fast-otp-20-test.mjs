import assert from 'node:assert/strict';
import {createFastOtpService} from './auth-fast-otp-20.mjs';
assert.throws(()=>createFastOtpService({projectId:'production'}),/FAST_OTP_DEV_CONFIG_REQUIRED/);
console.log('PASS fast OTP DEV project safety');
