import { Router } from 'express';
import {
  generateInstantMeeting,
  scheduleMeeting,
  joinMeeting,
  inviteParticipants,
  getMeeting,
  updateMeeting,
  cancelMeeting,
  getMeetingHistory,
  getUpcomingMeetings,
  endMeeting,
  generateMeetingValidation,
  scheduleMeetingValidation,
  inviteValidation,
  joinMeetingValidation,
  historyValidation,
} from '../controllers/meetingController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import {
  meetingRateLimiter,
  apiRateLimiter,
} from '../middlewares/rateLimiter.js';

const router = Router();

/**
 * Meeting Routes
 * Base path: /api/meeting
 */

// Generate instant meeting
router.post('/generate', authenticate, meetingRateLimiter, generateMeetingValidation, generateInstantMeeting);

// Schedule meeting
router.post('/schedule', authenticate, meetingRateLimiter, scheduleMeetingValidation, scheduleMeeting);

// Join meeting (public or authenticated)
router.post('/join/:meetingId', joinMeetingValidation, joinMeeting);

// Send invitations
router.post('/invite', authenticate, meetingRateLimiter, inviteValidation, inviteParticipants);

// Get meeting history
router.get('/history', authenticate, historyValidation, getMeetingHistory);

// Get upcoming meetings
router.get('/upcoming', authenticate, getUpcomingMeetings);

// Get single meeting
router.get('/:meetingId', authenticate, getMeeting);

// Update meeting
router.patch('/:meetingId', authenticate, updateMeeting);

// Cancel meeting
router.delete('/:meetingId', authenticate, cancelMeeting);

// End meeting
router.post('/:meetingId/end', authenticate, endMeeting);

export default router;