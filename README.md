# SEO App Factory

Automated pipeline for generating, testing, and deploying lightweight SEO-optimized web tool apps.

## Structure
- `apps/staging/` — newly generated apps awaiting review
- `apps/approved/` — apps that passed QA and evaluation  
- `apps/rejected/` — apps that failed evaluation (kept for learning)
- `deployed/` — production-ready apps with sitemap
- `scripts/` — pipeline automation scripts

## Pipeline
1. Auto-discovery finds niche keyword opportunities
2. Gemma generates single-file HTML apps
3. Browser testing validates functionality
4. Evaluation gate checks if niche is worth deploying
5. Approved apps get committed and deployed
