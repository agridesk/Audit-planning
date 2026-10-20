import assert from 'node:assert/strict';
import {notificationOverview} from './notification-overview-20.mjs';
const result=notificationOverview({config:[['EVENT_KEY','ACTIVE','SEND_EMAIL','TEMPLATE_FAMILY','RECIPIENT_TARGET'],['AUDIT_PLANNED_BY_MANAGER','TRUE','TRUE','RICH_OPERATIONAL','AUDITOR']],rules:[['RuleKey','Value'],['QUEUE_SHEET_NAME','Notification Queue']],settings:[['SettingKey','Value'],['TEST_MODE','OFF'],['RESEND_API_KEY','secret']],queue:[['Status','Type','LastError','TimestampCreated','Payload'],['PENDING','A','','today','secret-payload'],['FAILED','B','delivery failed','yesterday','secret-payload']]});
assert.equal(result.configuration.eventCount,1);assert.equal(result.configuration.ruleCount,1);assert.equal(result.configuration.settingCount,2);
assert.equal(result.queue.statusCounts.FAILED,1);assert.equal(result.queue.recentFailures[0].error,'delivery failed');
assert.equal(JSON.stringify(result).includes('secret'),false);
assert.equal(result.readOnly,true);
assert.throws(()=>notificationOverview({queue:[['Other'],['x']]}),/NOTIFICATION_QUEUE_STATUS_MISSING/);
// Canonical digest parameters must round-trip into the dashboard model.
const digest=notificationOverview({config:[
 ['EVENT_KEY','ACTIVE','SEND_EMAIL','CONSOLIDATE','BUFFER_MINUTES','DIGEST_GROUP'],
 ['AUDIT_ACCEPTED','YES','YES','YES','2','LIFECYCLE_MANAGER'],
 ['WEEKLY_MANAGER_COMING_UP','YES','YES','YES','60','MANAGER_WEEKLY']
]});
assert.equal(digest.events[0].bufferMinutes,'2');
assert.equal(digest.events[0].digestGroup,'LIFECYCLE_MANAGER');
assert.equal(digest.events[0].consolidate,'YES');
assert.equal(digest.events[1].bufferMinutes,'60');
console.log('notification-overview-20: PASS');
