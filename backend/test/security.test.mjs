import test from 'node:test';
import assert from 'node:assert/strict';
import {credentials,hashPassword,verifyPassword,token,digest,safeEqual} from '../security.mjs';
test('passwords are salted independently and incorrect passwords fail',async()=>{
  const first=await hashPassword('test-password-123'),second=await hashPassword('test-password-123');
  assert.notEqual(first,second);assert.ok(!first.includes('test-password-123'));
  assert.equal(await verifyPassword('test-password-123',first),true);
  assert.equal(await verifyPassword('incorrect',first),false);
  assert.equal(await verifyPassword('test-password-123','corrupt'),false);
});
test('credentials reject malformed usernames and short passwords',()=>{
  assert.equal(credentials('Sayoga_21','a-long-password'),'sayoga_21');
  assert.throws(()=>credentials('x','a-long-password'));
  assert.throws(()=>credentials('$where','a-long-password'));
  assert.throws(()=>credentials('sayoga','short'));
});
test('session tokens are random and only their digest is stored',()=>{
  const a=token(),b=token();assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
  assert.notEqual(digest(a),a);assert.equal(safeEqual(a,a),true);assert.equal(safeEqual(a,b),false);assert.equal(safeEqual(undefined,a),false);
});
