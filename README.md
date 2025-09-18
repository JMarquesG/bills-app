# Bills App 📧💰

A powerful, AI-enhanced desktop application for managing invoices, expenses, and client billing with intelligent automation features.

## ✨ Key Features

### 🧠 AI-Powered Document Processing
- **Smart Bill Analysis**: Automatically extract invoice details from PDF/image documents using OpenAI GPT-4o-mini vision API
- **Expense Receipt Scanning**: Intelligent parsing of receipt information including vendor, category, amount, and dates
- **Field Auto-Completion**: Pre-populate forms with AI-extracted data to minimize manual entry

### 📋 Invoice & Bill Management
- **Professional Invoice Generation**: Create and customize invoices with automated PDF generation
- **Client Management**: Comprehensive client database with contact information and billing history
- **Multiple Status Tracking**: Track invoices through draft, sent, paid, and overdue states
- **Flexible Templating**: Customizable invoice layouts and branding

### 💸 Expense Tracking
- **Category Organization**: Organize expenses by categories (Office Supplies, Travel, Software, Equipment, etc.)
- **Receipt Attachment**: Link physical receipts to expense entries
- **Automatic Analysis**: AI-powered extraction of expense details from receipt images

### 🤖 Automation & Scheduling
- **Recurring Invoices**: Set up automatic monthly billing for regular clients
- **Email Integration**: Automated invoice delivery with customizable email templates
- **Smart Scheduling**: Cron-based task processing for reliable automation
- **Template Variables**: Dynamic email content with client and invoice information

### 📊 Dashboard & Analytics
- **Financial Overview**: Real-time insights into income, expenses, and outstanding invoices
- **Visual Charts**: Interactive charts showing financial trends and patterns
- **KPI Tracking**: Key performance indicators for business health monitoring

## 🏗️ Technical Architecture

### Stack
- **Desktop Framework**: Electron with security-first architecture
- **Frontend**: React with TypeScript and Tailwind CSS
- **Database**: PGlite (embedded PostgreSQL) with Drizzle ORM
- **AI Integration**: OpenAI API with structured output parsing
- **PDF Generation**: PDFKit for professional invoice layouts
- **Email**: Nodemailer with SMTP configuration
- **Task Scheduling**: Node-cron for automated processes

### Project Structure
```
bills-app/
├── apps/
│   └── desktop/              # Main Electron application
│       ├── src/
│       │   ├── main/         # Electron main process
│       │   ├── preload/      # Secure IPC bridge
│       │   └── renderer/     # React UI components
│       └── electron-builder.yml
├── packages/
│   └── db/                   # Database schema and utilities
│       ├── src/
│       │   ├── index.ts      # Database initialization
│       │   └── schema.ts     # Table definitions
└── package.json              # Turborepo workspace
```

### Security Features
- **Sandboxed Renderer**: Secure isolation of UI components
- **Encrypted API Keys**: Safe storage of sensitive credentials
- **IPC Validation**: All inter-process communication validated with Zod
- **Context Bridge**: Minimal, secure API surface between main and renderer

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- OpenAI API key (for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bills-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

### Initial Setup

1. **First Launch**: The app will guide you through initial onboarding
2. **Company Profile**: Configure your business information for invoices
3. **OpenAI Integration**: Add your API key in Settings for AI features
4. **SMTP Configuration**: Set up email delivery for automated sending

## 🔧 Configuration

### Database
- Local PGlite database automatically initialized
- Data stored in `pgdata/` directory (development) or app userData (production)
- Automatic migrations on startup

### AI Features Configuration
1. Navigate to **Settings**
2. Add your **OpenAI API Key**
3. Choose encryption preferences
4. Test AI extraction on sample documents

### Email Automation Setup
1. Configure **SMTP Settings** with your email provider
2. Set up **Email Templates** for different invoice types
3. Create **Automation Rules** for recurring invoices
4. Test email delivery

## 📚 Usage Guide

### Creating Invoices
1. Go to **Bills** section
2. Click **New Invoice**
3. Select client or add new one
4. Fill invoice details or use **AI Extract** for existing documents
5. Preview and generate PDF
6. Send directly via email or save for later

### Processing Expenses
1. Navigate to **Expenses**
2. Add new expense entry
3. Attach receipt image/PDF
4. Use **AI Analysis** to auto-extract details
5. Categorize and save

### Setting Up Automation
1. Go to **Automation** section
2. Create new automation rule
3. Configure:
   - Client and billing amount
   - Recurring schedule (day of month)
   - Email template
   - CC recipients
4. Activate rule for automatic processing

## 🤖 AI Capabilities

### Document Analysis
The AI system can extract:
- **Client/Customer names**
- **Invoice numbers**
- **Dates** (issue, due, payment)
- **Amounts** and currencies
- **Descriptions** and line items
- **Vendor information** (for expenses)
- **Expense categories**

### Supported Formats
- PDF documents
- JPEG/PNG images
- Multi-page documents
- Various invoice layouts and languages

## 🔄 Automation Features

### Recurring Invoices
- Monthly billing cycles
- Customizable day-of-month scheduling
- Automatic PDF generation
- Email delivery with attachments

### Email Templates
Dynamic template variables:
- `{clientName}` - Client name
- `{invoiceNumber}` - Generated invoice number
- `{amount}` - Formatted invoice amount
- `{companyName}` - Your company name
- `{description}` - Invoice description

### Processing Schedule
- Daily automation check at configured intervals
- Reliable cron-based scheduling
- Error handling and retry logic
- Processing status tracking

## 🛠️ Development

### Building the Application
```bash
# Development build
npm run build

# Production build for macOS
npm run deploy:mac
```

### Database Migrations
Database schema is automatically managed through the embedded PGlite setup. Schema changes are applied on application startup.

### Adding New Features
1. Backend logic: `apps/desktop/src/main/ipc/`
2. UI components: `apps/desktop/src/renderer/src/`
3. Database changes: `packages/db/src/schema.ts`

## 📦 Distribution

### macOS
```bash
npm run deploy:mac
```
Generates `.dmg` installer in `dist-electron/`

### Windows/Linux
Electron-builder configuration can be extended for additional platforms.

## 🔒 Privacy & Security

- **Local-First**: All data stored locally, no cloud dependency
- **Encrypted Storage**: Sensitive API keys encrypted at rest
- **Secure IPC**: Validated communication between processes
- **Sandboxed Renderer**: UI isolated from system resources
- **No Telemetry**: No data collection or external tracking

## 🤝 Contributing

This is a personal project focused on efficient invoice management with AI enhancement. The codebase follows modern Electron security practices and clean architecture patterns.

## 📄 License

Private project - All rights reserved.

---

**Built with ❤️ using Electron, React, and OpenAI**
