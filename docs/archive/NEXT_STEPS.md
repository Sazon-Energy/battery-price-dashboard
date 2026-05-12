# Next Steps: Candidate Review Workflow Improvements

## Status: ✅ COMPLETED (January 18, 2026)

This workflow has been fully implemented. See `CANDIDATE_REVIEW_GUIDE.md` for the complete guide.

## What Was Completed
- Simplified database schema (removed cross-references)
- Created `/candidates` page for review
- Implemented batch SQL operations for approval/rejection
- Documented complete workflow in CANDIDATE_REVIEW_GUIDE.md

---

## Original Requirements (Now Complete)

## Goals

### 1. Simplify Database Schema
- **Minimize cross-references** between `battery_candidates` and `batteries` tables
- Candidates are uniquely identified by URL - this is sufficient for mapping if needed later
- No strong use case for tracking which candidate created which battery
- Candidates flow: discover → review → approve/reject → copy to batteries (one-time operation)

### 2. Create Read-Only Web UI for Candidate Review
Build a simple web page that shows:
- **Filtered list**: Only `status = 'pending'` candidates
- **Sort order**: By discovery time (oldest first)
- **Columns**:
  - Manufacturer name
  - Battery name (as clickable link to normalized URL)
  - Discovery time (automatically localized to browser timezone)
- **Purpose**: Easy review interface to identify which batteries to approve/reject

### 3. Streamline SQL Review Workflow
Current SQL works for single candidates, but need batch operations:

**Requirements**:
- Easy to update multiple candidates at once (both approve and reject)
- Copy candidate IDs from Supabase SQL Editor export
- Paste IDs into SQL with minimal editing
- Single SQL command to process a batch
- Work toward zero pending candidates efficiently

**Proposed approach**:
- Use SQL with array/list of UUIDs for batch operations
- Format options: CSV, JSON, or PostgreSQL array syntax
- Example workflow:
  1. Review candidates in web UI
  2. Export selected IDs from Supabase
  3. Paste IDs into SQL template
  4. Run single command to approve/reject batch

## Implementation Tasks

### Database Schema Review
- [ ] Review current foreign key relationships
- [ ] Determine if we can remove candidate_id from batteries table
- [ ] Create migration if schema changes needed

### Web UI Development
- [ ] Create new page for candidate review
- [ ] Implement filtered query (status = pending)
- [ ] Add table with required columns
- [ ] Format discovery time with browser timezone
- [ ] Make battery names clickable links

### SQL Batch Operations
- [ ] Create SQL template for batch approval
- [ ] Create SQL template for batch rejection
- [ ] Test with different ID formats (array, CSV, JSON)
- [ ] Document the easiest workflow

## Notes
- Approval copies candidate data to batteries table (one-time)
- No need to maintain ongoing relationship after approval
- Focus on efficiency: get to zero pending quickly
- Use Supabase SQL Editor for execution
