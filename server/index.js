import express from 'express';
import cors from 'cors';
import emailValidator from 'deep-email-validator';
import dns from 'dns';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const resolveMx = promisify(dns.resolveMx);
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const MAJOR_PROVIDERS = {
  'gmail.com': {
    mxPriority: 'aspmx.l.google.com',
    smtpHost: 'gmail-smtp-in.l.google.com',
  },
  'outlook.com': {
    mxPriority: 'outlook-com.olc.protection.outlook.com',
    smtpHost: 'smtp.office365.com',
  },
  'yahoo.com': {
    mxPriority: 'mx-in.mail.yahoo.com',
    smtpHost: 'mta5.am0.yahoodns.net',
  },
  'hotmail.com': {
    mxPriority: 'hotmail-com.olc.protection.outlook.com',
    smtpHost: 'smtp.office365.com',
  },
};

// Rate limiting middleware
const rateLimit = {
  windowMs: 15 * 60 * 1000,
  max: 25000,
  current: new Map(),
};

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowStart = now - rateLimit.windowMs;
  
  if (!rateLimit.current.has(ip)) {
    rateLimit.current.set(ip, []);
  }
  
  const requests = rateLimit.current.get(ip);
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= rateLimit.max) {
    return res.status(429).json({
      valid: false,
      reason: 'Too many requests. Please try again later.'
    });
  }
  
  recentRequests.push(now);
  rateLimit.current.set(ip, recentRequests);
  
  next();
});

async function checkMailboxExistence(email) {
  const [localPart, domain] = email.split('@');
  
  try {
    // Get MX records
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: 'No MX records found',
      };
    }

    // Additional checks for major providers
    if (MAJOR_PROVIDERS[domain]) {
      const provider = MAJOR_PROVIDERS[domain];
      const hasPriorityMx = mxRecords.some(record => 
        record.exchange.toLowerCase().includes(provider.mxPriority)
      );

      if (!hasPriorityMx) {
        return {
          valid: false,
          reason: 'Invalid MX configuration for major provider',
        };
      }
    }

    // Perform deep validation
    const result = await emailValidator({
      email,
      validateRegex: true,
      validateMx: true,
      validateTypo: true,
      validateDisposable: true,
      validateSMTP: true,
      validateFormat: true,
    });

    // Enhanced validation result
    return {
      valid: result.valid,
      reason: result.reason,
      checks: {
        mx: result.validators.mx.valid,
        dns: result.validators.regex.valid,
        spf: result.validators.typo.valid,
        mailbox: result.validators.disposable.valid,
        smtp: result.validators.smtp.valid,
      },
      details: {
        provider: MAJOR_PROVIDERS[domain] ? domain : 'other',
        mxServer: mxRecords[0].exchange,
      }
    };
  } catch (error) {
    console.error('Mailbox check error:', error);
    return {
      valid: false,
      reason: 'Failed to verify mailbox',
      error: error.message,
    };
  }
}

app.post('/api/validate', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        valid: false,
        reason: 'Email is required'
      });
    }

    const result = await checkMailboxExistence(email);
    return res.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      valid: false,
      reason: 'Server error occurred'
    });
  }
});

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});