# Personal Resume and Career Platform Design

## 1. Purpose

This project is a personal website for a college senior studying Information
Systems and Business Analytics. Its first job is to present a clear,
professional view of the owner's experience, projects, and skills.

The site should also be a useful learning project. It should demonstrate
application development, database design, authentication, deployment, cloud
networking, and security in a way that the owner can explain during interviews.

The first release is a resume and portfolio website. It is not yet a complete
career marketplace or social network.

## 2. Audience and goals

### Primary audience

The public site is for anyone discovering the owner's professional work,
including recruiters, hiring managers, classmates, and potential collaborators.

### First-release goals

1. Present a polished and credible professional profile.
2. Make projects easy to understand from both business and technical
   perspectives.
3. Let the owner update content without changing application code.
4. Provide a contact path for opportunities.
5. Create a foundation that can later grow into opportunity tracking and other
   career-platform features.

### Success criteria

The first release is successful when the owner can:

- Explain how the browser, application, database, authentication, and cloud
  services work together.
- Add, edit, preview, publish, and unpublish content through the admin area.
- Show a visitor a professional homepage, resume, project details, and contact
  form.
- Deploy the application using AWS-oriented managed services.

## 3. Plain-English architecture

The recommended architecture is a **managed full-stack application**. This
means one organized application serves the public website and the private
admin dashboard, while managed cloud services handle hosting, the database,
authentication, email, and other infrastructure.

This is recommended over a collection of separate services because it teaches
the important concepts without adding unnecessary operational complexity.
Clear boundaries inside the application will still make future separation
possible if the platform grows substantially.

### Main parts

| Part | Responsibility |
| --- | --- |
| Public website | Displays published profile, experience, projects, skills, and resume content. |
| Admin dashboard | Lets the owner create drafts, preview changes, publish content, and manage inquiries. |
| Application/API layer | Applies business rules and controls access between the website, dashboard, and database. |
| Relational database | Stores structured career information and contact inquiries in related tables. |
| Authentication service | Confirms the identity of the single admin user. |
| Email service | Sends a notification when a visitor submits the contact form. |
| PDF service | Creates a downloadable resume from published structured data. |
| AWS hosting and networking | Runs the application and controls how services communicate securely. |

### Request flows

For a public page:

1. A visitor's browser requests a page.
2. The application asks the database for published content.
3. The application returns only content allowed on the public site.

For an admin edit:

1. The owner signs in.
2. Authentication confirms the account.
3. Protected admin routes check that the owner is authorized.
4. The application reads or changes draft data in the database.

For a contact inquiry:

1. A visitor submits the form.
2. The application validates and rate-limits the request.
3. The inquiry is stored privately.
4. The email service sends a notification to the owner.

## 4. First-release scope

### Public features

- A balanced homepage with an introduction, skills summary, and featured work.
- About / professional summary page.
- Work experience page.
- Projects / portfolio page.
- Skills and tools page.
- Project detail pages with shareable URLs.
- Contact form with email notification.
- Search-engine metadata, sitemap, semantic HTML, and social previews.
- A generated downloadable PDF resume.

The visual direction is professional and classic: restrained styling,
readable typography, clear hierarchy, and a polished portfolio presentation.

### Admin features

- Single-owner sign-in.
- Create and edit profile, experience, projects, and skills.
- Save entries as drafts.
- Preview draft content before publishing.
- Publish, unpublish, and archive entries.
- Set display order and featured status.
- View contact inquiries and their basic status.
- Add private notes to inquiries.
- Generate the current published resume PDF.

### Out of scope for the first release

- Public user accounts.
- Multiple editors or teams.
- Public comments, endorsements, or messaging.
- A job board or automated job matching system.
- A full CRM.
- Multiple public profiles or tailored resume versions.
- Articles, newsletters, or a community area unless added later as a separate
  approved scope.

## 5. Data model

The database is organized like a set of connected spreadsheets. Each table
stores one kind of information, and relationships connect related records.

### Profile

Stores the owner's name, headline, summary, location, profile links, and
contact settings.

### Experience

Stores employer, job title, start and end dates, description, accomplishments,
display order, featured status, and publication state.

### Project

Stores title, summary, business context, technical details, outcomes,
technologies, links, images or media references, display order, featured
status, and publication state.

Projects should support both business and technical storytelling. A visitor
should be able to understand the problem, the solution, the technologies used,
and the result.

### Skill

Stores skill name, category, supporting evidence or experience, display order,
and publication state. Skill categories may include analytics, application
development, cloud, databases, and business tools.

### Resume settings

Stores which published experience, projects, and skills should appear in the
generated PDF. This creates room for future tailored resume versions without
requiring a redesign of the core records.

### Contact inquiry

Stores visitor name, email, message, opportunity type, status, private notes,
creation time, and update time. The first release treats inquiries as the
starting point for future opportunity tracking.

### User

Stores the single admin identity through the selected authentication service.
Passwords and authentication secrets should be delegated to the provider
instead of being implemented directly in application tables.

### Shared record behavior

Editable records should have:

- A stable identifier.
- Created and updated timestamps.
- A publication state such as draft, published, or archived.
- An explicit display order where ordering matters.

The data model should support one owner now without scattering one-person
assumptions through every feature. This keeps the future path open for
multiple resume versions and richer opportunity workflows.

## 6. Security and privacy

- Public requests can read published public content only.
- Drafts, private inquiry notes, account information, and administrative data
  must never be exposed through public endpoints.
- Every admin read and write operation requires authentication and
  authorization.
- Contact fields are validated on the server, not only in the browser.
- Contact submissions are rate-limited and protected from obvious automated
  abuse.
- Database credentials, API keys, and email credentials are stored in managed
  environment configuration, never committed to the repository.
- Inquiry data is private and should have a manual deletion capability.
- Logs should avoid recording unnecessary personal message contents or
  credentials.

The initial privacy approach favors collecting only the information needed to
respond to an inquiry. A future retention policy can be added after the owner
decides how long inquiries should be kept.

## 7. AWS and deployment direction

AWS is the preferred cloud ecosystem because it provides strong exposure to
cloud networking, security, managed databases, and enterprise technology
concepts relevant to Information Systems and Business Analytics.

The implementation plan should prefer managed AWS services where they reduce
operational work. The exact service selection is intentionally deferred until
the implementation plan, where cost, simplicity, and the learning objective
can be compared explicitly.

The deployment should include:

- Separate development and production configuration.
- A repeatable deployment process.
- Database migrations for schema changes.
- Environment-specific secrets.
- Basic application logs and health checks.
- A secure network path between the application and database.
- A documented rollback or recovery procedure appropriate for the selected
  hosting service.

## 8. Error handling and reliability

- Invalid form input should return a clear validation error.
- Authentication failures should not reveal whether sensitive account details
  exist.
- Database or email failures should be logged and surfaced as a useful
  user-facing error rather than silently ignored.
- Publishing should fail safely if required content is invalid.
- A failed email notification should not silently delete a successfully stored
  inquiry; the system should preserve the inquiry and record the notification
  failure for later review.
- Public pages should handle missing or archived content with a deliberate
  not-found response.

## 9. Testing and learning plan

Testing should focus on rules that protect data and explain the architecture:

- Unit tests for publication-state and ordering rules.
- Integration tests for public versus admin access.
- Tests that verify drafts are not publicly visible.
- Tests for contact validation and inquiry storage.
- Tests for PDF generation from representative resume data.
- A small end-to-end test for signing in, editing a draft, publishing it, and
  viewing the public result.

The project documentation should include a simple architecture diagram,
database relationship explanation, deployment steps, and a glossary of terms.
The goal is not only for the application to work, but for the owner to be able
to explain why each major part exists.

## 10. Future growth path

The first release creates a controlled foundation for:

1. Opportunity statuses such as new, reviewing, in progress, and closed.
2. Follow-up dates, notes, and reminders for inquiries.
3. Multiple tailored resume versions.
4. Public availability and opportunity preferences.
5. Articles or case studies.
6. Analytics about portfolio engagement.
7. Recommendations, networking, or other platform features if they become
   valuable.

These features should be added only when their user need is clear. The initial
release should remain focused on a strong, maintainable resume and portfolio
experience.

## 11. Decisions still deferred to implementation planning

The following choices are intentionally not implementation decisions yet:

- Exact programming language and framework.
- Exact AWS hosting, database, authentication, email, and storage products.
- Exact PDF-generation library or service.
- Domain name and visual design system.
- Inquiry retention period.

The implementation plan should recommend these choices using three criteria:
beginner comprehensibility, career relevance, and reasonable cost.

## 12. Approval boundary

This document is a design specification only. No application code, database,
cloud resources, or deployment configuration should be created until the
owner reviews and explicitly approves this specification.
