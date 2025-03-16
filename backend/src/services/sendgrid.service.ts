// backend/src/services/sendgrid.service.ts

import sgMail from '@sendgrid/mail';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';

/**
 * Email data interface
 */
interface IEmailData {
  to: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: {
    content: string;
    filename: string;
    type: string;
    disposition: string;
  }[];
  category?: string;
  customArgs?: Record<string, string>;
}

/**
 * SendGrid service for email sending
 */
export class SendGridService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('SendGridService');
    
    // Initialize SendGrid
    if (config.sendgrid.apiKey) {
      sgMail.setApiKey(config.sendgrid.apiKey);
    } else {
      this.logger.warn('SendGrid API key not provided - email functionality will be disabled');
    }
  }

  /**
   * Send a simple email
   * 
   * @param to - Recipient email address(es)
   * @param subject - Email subject
   * @param text - Plain text content
   * @param html - HTML content (optional)
   * @returns Success status
   */
  async sendEmail(
    to: string | string[],
    subject: string,
    text: string,
    html?: string
  ): Promise<boolean> {
    try {
      // Skip if SendGrid is not configured
      if (!config.sendgrid.apiKey) {
        this.logger.warn('Skipping email send - SendGrid not configured');
        return false;
      }

      const msg = {
        to,
        from: config.sendgrid.senderEmail,
        subject,
        text,
        html: html || text,
        messageId: uuidv4()
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      this.logger.error('Error sending email', { error, to, subject });
      return false;
    }
  }

  /**
   * Send an email using a SendGrid template
   * 
   * @param emailData - Email data including template ID and dynamic data
   * @returns Success status
   */
  async sendTemplateEmail(emailData: IEmailData): Promise<boolean> {
    try {
      // Skip if SendGrid is not configured
      if (!config.sendgrid.apiKey) {
        this.logger.warn('Skipping template email send - SendGrid not configured');
        return false;
      }

      if (!emailData.templateId) {
        throw new Error('Template ID is required');
      }

      const msg = {
        to: emailData.to,
        from: config.sendgrid.senderEmail,
        templateId: emailData.templateId,
        dynamicTemplateData: emailData.dynamicTemplateData || {},
        cc: emailData.cc,
        bcc: emailData.bcc,
        attachments: emailData.attachments,
        category: emailData.category,
        customArgs: {
          ...emailData.customArgs,
          messageId: uuidv4()
        }
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      this.logger.error('Error sending template email', { error, emailData });
      return false;
    }
  }

  /**
   * Send a project invitation email
   * 
   * @param projectId - Project ID
   * @param projectName - Project name
   * @param recipientEmail - Recipient email
   * @param recipientName - Recipient name
   * @param senderName - Sender name
   * @param message - Optional personalized message
   * @returns Success status
   */
  async sendProjectInvitation(
    projectId: string,
    projectName: string,
    recipientEmail: string,
    recipientName: string,
    senderName: string,
    message?: string
  ): Promise<boolean> {
    try {
      // Generate access token or link (implementation depends on your auth system)
      const projectLink = `${config.frontend.url}/projects/${projectId}`;
      
      const emailData: IEmailData = {
        to: recipientEmail,
        templateId: config.sendgrid.templates.projectInvitation,
        dynamicTemplateData: {
          projectName,
          recipientName,
          senderName,
          message: message || `I've invited you to collaborate on the ${projectName} project.`,
          projectLink,
          currentYear: new Date().getFullYear()
        },
        category: 'project_invitation'
      };

      return this.sendTemplateEmail(emailData);
    } catch (error) {
      this.logger.error('Error sending project invitation', { 
        error, 
        projectId, 
        recipientEmail 
      });
      return false;
    }
  }

  /**
   * Send form submission notification
   * 
   * @param formType - Type of form submitted
   * @param projectId - Project ID
   * @param projectName - Project name
   * @param recipientEmail - Recipient email
   * @param submitterName - Name of person who submitted the form
   * @returns Success status
   */
  async sendFormSubmissionNotification(
    formType: string,
    projectId: string,
    projectName: string,
    recipientEmail: string,
    submitterName: string
  ): Promise<boolean> {
    try {
      const formLink = `${config.frontend.url}/projects/${projectId}/forms`;
      
      const emailData: IEmailData = {
        to: recipientEmail,
        templateId: config.sendgrid.templates.formSubmission,
        dynamicTemplateData: {
          formType,
          projectName,
          submitterName,
          formLink,
          submissionDate: new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          currentYear: new Date().getFullYear()
        },
        category: 'form_submission'
      };

      return this.sendTemplateEmail(emailData);
    } catch (error) {
      this.logger.error('Error sending form submission notification', { 
        error, 
        formType, 
        projectId, 
        recipientEmail 
      });
      return false;
    }
  }

  /**
   * Send estimate approval request
   * 
   * @param estimateId - Estimate ID
   * @param projectId - Project ID
   * @param projectName - Project name
   * @param recipientEmail - Recipient email
   * @param recipientName - Recipient name
   * @param amount - Estimate amount
   * @returns Success status
   */
  async sendEstimateApprovalRequest(
    estimateId: string,
    projectId: string,
    projectName: string,
    recipientEmail: string,
    recipientName: string,
    amount: number
  ): Promise<boolean> {
    try {
      const estimateLink = `${config.frontend.url}/projects/${projectId}/estimates/${estimateId}`;
      
      const emailData: IEmailData = {
        to: recipientEmail,
        templateId: config.sendgrid.templates.estimateApproval,
        dynamicTemplateData: {
          recipientName,
          projectName,
          estimateAmount: amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD'
          }),
          estimateLink,
          expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          currentYear: new Date().getFullYear()
        },
        category: 'estimate_approval'
      };

      return this.sendTemplateEmail(emailData);
    } catch (error) {
      this.logger.error('Error sending estimate approval request', { 
        error, 
        estimateId, 
        projectId, 
        recipientEmail 
      });
      return false;
    }
  }

  /**
   * Track email open
   * 
   * @param messageId - Message ID to track
   * @returns Success status
   */
  async trackEmailOpen(messageId: string): Promise<boolean> {
    try {
      // This would typically update a database record or call an analytics service
      // For this example, we'll just log the open
      this.logger.info('Email opened', { messageId });
      return true;
    } catch (error) {
      this.logger.error('Error tracking email open', { error, messageId });
      return false;
    }
  }
}
