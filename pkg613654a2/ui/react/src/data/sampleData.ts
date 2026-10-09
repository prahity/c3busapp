/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// Sample data

export const projects = [
  { text: 'Project Alpha', value: 'alpha' },
  { text: 'Project Beta', value: 'beta' },
  { text: 'Project Gamma', value: 'gamma' }
];

export const programs = [
  { text: 'NJ EDA Product', value: 'nj-eda' },
  { text: 'NYC Transit Update', value: 'nyc-transit' },
  { text: 'CA Tech Summit', value: 'ca-tech' },
  { text: 'TX Health Initiative', value: 'tx-health' },
  { text: 'FL Education Reform', value: 'fl-education' },
  { text: 'WA Green Project', value: 'wa-green' },
  { text: 'IL Infrastructure Plan', value: 'il-infrastructure' },
  { text: 'MA Cybersecurity Workshop', value: 'ma-cybersecurity' }
];

export const owners = [
  { text: 'Alice Johnson', value: 'alice' },
  { text: 'Michael Brown', value: 'michael' },
  { text: 'Emma Davis', value: 'emma' },
  { text: 'James Wilson', value: 'james' },
  { text: 'Sophia Garcia', value: 'sophia' },
  { text: 'David Martinez', value: 'david' },
  { text: 'Olivia Rodriguez', value: 'olivia' },
  { text: 'Liam Lee', value: 'liam' }
];

export const checklists = [
  { text: 'Receipt Checklist', value: 'receipt' },
  { text: 'Event Checklist 2025', value: 'event-2025' },
  { text: 'Progress Report by Emily Davis', value: 'progress-emily' },
  { text: 'Invoice Checklist', value: 'invoice' },
  { text: 'Proposal Checklist', value: 'proposal' },
  { text: 'Workshop Checklist Created by Laura', value: 'workshop-laura' }
];

export const uploadedBy = [
  { text: 'Michael Brown', value: 'michael' },
  { text: 'Sarah Johnson', value: 'sarah' },
  { text: 'David Lee', value: 'david' },
  { text: 'Emily Davis', value: 'emily' },
  { text: 'John Smith', value: 'john' },
  { text: 'Anna White', value: 'anna' },
  { text: 'Chris Green', value: 'chris' },
  { text: 'Laura Adams', value: 'laura' }
];

export const documents = [
  {
    documentName: 'GA-39582',
    program: 'NJ EDA Product',
    owner: 'Alice Johnson',
    checklistApplied: 'Receipt Checklist',
    attachments: 4,
    uploadedBy: 'Michael Brown',
    uploadedAt: '12/05/2025 10:00AM'
  },
  {
    documentName: 'GA-39583',
    program: 'NYC Transit Update',
    owner: 'Michael Brown',
    checklistApplied: 'Event Checklist 2025',
    attachments: 3,
    uploadedBy: 'Sarah Johnson',
    uploadedAt: '12/15/2025 09:30AM'
  },
  {
    documentName: 'GA-39584',
    program: 'CA Tech Summit',
    owner: 'Emma Davis',
    checklistApplied: 'Progress Report by Emily Davis',
    attachments: 5,
    uploadedBy: 'David Lee',
    uploadedAt: '12/20/2025 11:00AM'
  },
  {
    documentName: 'GA-39585',
    program: 'TX Health Initiative',
    owner: 'James Wilson',
    checklistApplied: 'Invoice Checklist',
    attachments: 2,
    uploadedBy: 'Emily Davis',
    uploadedAt: '12/22/2025 01:00PM'
  },
  {
    documentName: 'GA-39586',
    program: 'FL Education Reform',
    owner: 'Sophia Garcia',
    checklistApplied: 'Proposal Checklist',
    attachments: 4,
    uploadedBy: 'John Smith',
    uploadedAt: '12/30/2025 03:00PM'
  },
  {
    documentName: 'GA-39587',
    program: 'WA Green Project',
    owner: 'David Martinez',
    checklistApplied: 'Workshop Checklist Created by Laura',
    attachments: 6,
    uploadedBy: 'Anna White',
    uploadedAt: '01/05/2026 10:30AM'
  },
  {
    documentName: 'GA-39588',
    program: 'IL Infrastructure Plan',
    owner: 'Olivia Rodriguez',
    checklistApplied: 'Receipt Checklist',
    attachments: 2,
    uploadedBy: 'Chris Green',
    uploadedAt: '01/10/2026 11:15AM'
  },
  {
    documentName: 'GA-39589',
    program: 'MA Cybersecurity Workshop',
    owner: 'Liam Lee',
    checklistApplied: 'Event Checklist 2025',
    attachments: 3,
    uploadedBy: 'Laura Adams',
    uploadedAt: '01/15/2026 09:00AM'
  }
];
