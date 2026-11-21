# SaaS and in-house app register: validation from real social feedback
Research only. Nothing was posted, commented, DMed or signed up for. Compiled 21 Nov 2026.

## How this was gathered (and what's missing)
- **Reddit:** reddit.com blocked direct fetches (HTTP 403), so posts and comment threads came from the Arctic Shift public Reddit archive. Links are the original reddit.com permalinks. About 55 threads were read in full across r/sysadmin, r/ITManagers, r/msp, r/SaaS, r/smallbusiness, r/devops, r/webdev and r/okta. A comment may have been edited or deleted since it was archived. Some full-text searches on r/sysadmin timed out, so title searches were used there instead.
- **X:** public search, including Japanese queries (SaaS管理 スプレッドシート, SaaS 棚卸し, SaaS 更新 忘れ). The search only returned posts from about the last 30 days (late Oct to Nov 2026), and English results were mostly consumer subscriptions, so this is a thin signal.
- **G2:** pros and cons pages read for Torii, Zylo, BetterCloud and Cledara. Capterra was used for Zylo and Substly pricing. The Gartner Peer Insights page for Productiv returned HTTP 500 and could not be read.
- **Pricing:** vendor pricing pages, AWS Marketplace listings, and third-party price trackers (Vendr data via getpricepulse and stackkite, plus toolradar). Third-party figures are labelled as such.
- **Hacker News (Algolia API):** about 270 hits. Almost nothing on-topic, so it is barely used.
- **Not covered:**
  - LinkedIn posts. They aren't searchable without logging in, so none were used.
  - r/startups, r/selfhosted, r/CIO and r/nonprofit, where searches returned little that was relevant.
  - Family offices and holding companies: no posts found.
  - Nonprofits: only one vendor page (RenewalTracker) and nothing first-hand.
- **Correction to PA's brief:**
  - The Josys "63% use spreadsheets" figure is real, but the article doesn't say the sample is Japanese firms. It's an article on Josys's Japanese site with no sample described ([source](https://www.josys.com/jp/article/the-state-of-saas-management-new-data-reveals-critical-gaps-and-opportunities-for-it-leaders)).
  - Torii's "$12–15k a year" is low. Vendr buyer data puts the median at **$32,000 a year**, with a range of $14,000 to $53,533 ([Vendr](https://www.vendr.com/marketplace/torii)).
- **Caution:** these threads are full of vendor plugs and "I'm validating an idea" posts. Several regulars openly call that out (see section 4). Where a quoter is a vendor or is building a tool, it's marked.

---

## 1. Top pain points (ranked by how often they appear and how hot they run)

### #1 Missed notice periods and auto-renewal traps (most frequent, highest upvotes)
The renewal date isn't the real deadline. The notice deadline is, often 60–90 days earlier.
- "FYI, Add Proofpoint to the list of companies that need 90 days notice before non-renewal … We should have a list of shame linked in the sidebar or something." (OP, 185 upvotes, Oct 2026) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1x60i7g/fyi_add_proofpoint_to_the_list_of_companies_that/)
- "These 90 day notices for subscription only stuff is really dumb … The 90 days was only put in there to trap you into paying more money." (u/Surffisher2A, 57 upvotes) [link](https://www.reddit.com/r/sysadmin/comments/1x60i7g/fyi_add_proofpoint_to_the_list_of_companies_that/pgr5t4l/)
- "my CDW rep told me it was a 60 day notice and it was a 90 notice. I gave them notice at 80 days. They decided to ignore the good faith effort and charge me for the full year" (u/Flatline1775, 38 upvotes) [r/ITManagers](https://www.reddit.com/r/ITManagers/comments/1dpg41g/missed_an_annual_deadline_to_cancel_a_saas_will/lagoy0h/)
- Also: "the contract auto-renewed for another full year … We missed the 30-day cancellation window" (OP) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1krf7j6/anyone_ever_successfully_convinced_a_vendor_to/)

### #2 Ownership walks out the door (renewals, knowledge and access tied to one person)
- "Renewal notifications went out via email, but half the time they went to people who'd already left the team. High churn meant nobody knew who owned what" (OP) [r/ITManagers](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/)
- "what really keeps my team on top of this is that it is one team members job to oversee contracts … Without that single contact point and sense of ownership things can fall apart." (u/Hopeful_Shoe2753) [link](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/ocvwuvv/)
- "the knowledge lived in one person's head, their incomplete Bitwarden, and a few half-maintained spreadsheets. Once they were gone, we had to reconstruct what software we actually used by reconciling credit card statements and invoices." (u/klayderpus, who later built their own tool) [link](https://www.reddit.com/r/ITManagers/comments/1mzzhw4/renewal_tracking_software/nxyf78w/)
- "Missing the renewal window is tough, it's happened to me on a few occasions with undocumented services that I inherited." (u/Pseudo_Idol, 20 upvotes) [link](https://www.reddit.com/r/sysadmin/comments/1krf7j6/anyone_ever_successfully_convinced_a_vendor_to/mtcze4k/)

### #3 Shadow purchases on cards, plus duplicate tools
- "we're paying for 5 separate subscriptions to Notion across 3 different credit cards … we're spending like $900 per month on Notion when we could have one enterprise plan for close to 500" (OP, 463 upvotes) [r/smallbusiness](https://www.reddit.com/r/smallbusiness/comments/1or3gas/we_have_5_subscriptions_of_the_same_software/)
- "Just finished chasing down 3 auto-renewals from tools nobody remembers buying. One's on the company card, one's on someone's personal card (who left 6 months ago), and one was 'just a free trial.'" (OP, 121 upvotes) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1oeo21h/i_swear_saas_renewals_are_slowly_turning_into_a/)
- "the tools someone signed up for with a personal card that ended up on a company card, and now auto-renew every year with zero visibility." (u/Sufficient-Cat8386) [link](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/odgmnkt/)
- Japan: "部門が独自に契約したSaaSや保守用のリモート接続は特に台帳から漏れがちです" ("SaaS contracted independently by departments, and remote-maintenance connections, are especially likely to fall off the register") [@toushikaka on X](https://x.com/toushikaka/status/2121177822920401092)

### #4 The spreadsheet is always stale
- "I've got a shared spreadsheet to track this junk but it's always out of date." (OP) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1oeo21h/i_swear_saas_renewals_are_slowly_turning_into_a/)
- "We keep a spreadsheet, but it's only accurate because renewals force us to update it. Otherwise nobody remembers." (u/nafiulhasanbd) [r/smallbusiness](https://www.reddit.com/r/smallbusiness/comments/1vgslar/small_businessstartup_folks_how_do_you_actually/p20abkl/)
- "We're 378 people now and still on sheets, SSO logs, and finance exports. It works, but it eats days, and you're never really sure you caught evrything." (u/Crafty_Assignment686) [r/ITManagers](https://www.reddit.com/r/ITManagers/comments/175o73t/saas_management_platforms/neudaxb/)

### #5 Enterprise tools are too expensive, too heavy, and slow to set up
- "Spreadsheets: Free, but they are a nightmare to maintain … Enterprise Tools: Huge price tags, massive bloat, and months of setup that never seems to end." (OP, who was also building a tool; mods removed the post as promotional) [r/msp](https://www.reddit.com/r/msp/comments/1q5qveo/is_there_a_middle_ground_between_excel_and/)
- Zylo G2 review: "It took over a year to get our data into Zylo and kept up-to-date. They ended up offering a managed service for it (paid of course) … we spent more time getting data into Zylo and keeping it updated than actually using it." [G2](https://www.g2.com/products/zylo/reviews)
- "Torii and Zluri are super expensive. Often eating up almost as much as you save..." (u/Altruistic_One_8427, who plugs Corma in the same comment) [link](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/od6lg9z/)
- "We tried demos with Zluri and Torii, but they felt too heavy for what we need." (u/Crafty_Assignment686) [link](https://www.reddit.com/r/ITManagers/comments/175o73t/saas_management_platforms/nfriir6/)

### #6 Apps built in-house or by non-engineers that nobody owns (new and rising; see section 5)
- "Nobody on my team knew it existed. It was a Lovable app hitting our Supabase with a service key, deployed to Vercel under someone's personal account, and the person who built it had left." (OP, 288 upvotes, 168 comments, Nov 2026) [r/devops](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/)
- "it ran fine for like 3 months until the api key rotated and suddenly half the sales pipeline data was wrong … nobody thinks about maintenance." (u/Embarrassed_Tap9992, 293 upvotes) [link](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/19s0315syu7r4/)

### #7 Offboarding leaves paid seats and access behind, including vendors'
- "found VPN accounts for an MSP we stopped using in 2023 … When contracts end procurement closes the purchase order and that's it. Nobody tells IT to revoke technical access." (OP, 142 upvotes; some commenters suspected it was a bait post) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1skauc1/vendor_we_fired_2_years_ago_still_has_vpn_access/)
- "we have 40 GitLab licenses and 22 active users because offboarding never triggers a license review … Nobody owns that process end-to-end, so it just rots." (u/troinet_tech) [link](https://www.reddit.com/r/ITManagers/comments/1px9zsw/it_license_optimization_consulting_would_you_pay/oz0wmt4/)
- Japan (Josys survey of 1,000 IT staff, Jan 2023): only 25.7% said they fully delete leavers' SaaS accounts, and 19.4% had a leak or near-miss from forgotten leaver accounts ([Raksul/Josys press release](https://corp.raksul.com/news/press/230126josys_survey/))

### #8 (weak evidence) SDK, API and patch-note changes that need action
Searches turned up very few first-hand complaints from small IT teams about missing vendor deprecations. The biggest r/sysadmin "Graph API retirement" thread turned out to be a fake announcement ([thread](https://www.reddit.com/r/sysadmin/comments/1lfjolw/ms_announcement_microsoft_graph_api_retirement/)). Most material on the topic is vendor blog content (PageCrawl, Truto, Wakelog). **Treat this as unproven demand.** At most, make it an optional field, not a pillar.

---

## 2. What people use today, and what's wrong with each
| Today | Who says so | What's wrong |
|---|---|---|
| Excel or Google Sheets with colour coding | u/Furnock: "Yellow for 90-31 days out Red for -30" ([link](https://www.reddit.com/r/ITManagers/comments/1mzzhw4/renewal_tracking_software/nanrvl6/)) | Goes stale; ownership drifts; "blew up once more than one person 'owned' it" ([u/Silent_Anywhere3411](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/oda2f8l/)) |
| SharePoint or Microsoft Lists plus Power Automate | "SharePoint list and use PowerAutomate to send reminders via email when they're 90 days out" (u/codinginacrown, 101 upvotes) ([link](https://www.reddit.com/r/sysadmin/comments/1hnu1ci/what_are_you_using_for_documentation_and/m44l7vh/)) | Microsoft-only and DIY: "A shame Sharepoint just can't do it on its own" ([link](https://www.reddit.com/r/sysadmin/comments/1hnu1ci/what_are_you_using_for_documentation_and/m4akm7d/)) |
| ITSM or CMDB (Freshservice, ServiceNow, Halo) | "Contract/renewal date is just another field in our CMDB." (u/bitslammer) | Fine if you already have one; heavy and pricey if you don't |
| MSP PSA or docs tools (Autotask, ConnectWise, IT Glue, Hudu) | "ITGlue gets way oversold … It's fine." ([link](https://www.reddit.com/r/sysadmin/comments/1be1c5i/how_do_you_keep_track_of_subscriptions/kurg7qn/)) | Built for MSPs; "they can be expensive … and complex, for smaller MSPs" ([u/bonsoir-world](https://www.reddit.com/r/msp/comments/1qu8w93/how_do_you_actually_track_billing_renewals/o3d5bo3/)) |
| Asset tools (Snipe-IT, GLPI, Asset Panda) | Asset Panda to Snipe-IT: "went from $6600 a year to $400" ([link](https://www.reddit.com/r/sysadmin/comments/1lf9a1z/currently_using_asset_panda_our_renewal_came_back/n26n7wi/)) | Hardware-first. SaaS is shoehorned in as a "license", with no notice-date logic and no app ownership model |
| Shared mailbox plus calendar | "95% of renewal or expiry notices come to the shared mailbox" ([link](https://www.reddit.com/r/sysadmin/comments/1be1c5i/how_do_you_keep_track_of_subscriptions/kuqgki4/)) | Breaks when notices go to someone's personal inbox or spam |
| Enterprise SMPs (Torii, Zylo, Productiv, BetterCloud) | Zylo: "$35k a year … (1,000+ company) and saved about $150k" ([link](https://www.reddit.com/r/ITManagers/comments/1l9qz96/how_do_you_track_saas_usage_and_waste_internally/nmwmees/)) | Price; setup takes months; Okta-dependent usage data; SaaS-only. Torii G2: "missing a lot of integrations … bulk options, usually require CS support and preset Excel files" ([G2](https://www.g2.com/products/torii/reviews?qs=pros-and-cons)) |
| Cheap spend tools (Cledara, Substly) | Cledara G2 cons: invoice capture "sometimes misses invoices" ([G2](https://www.g2.com/products/cledara/reviews?qs=pros-and-cons)) | Built around finance, cards and spend. No in-house apps, no engineering ownership |
| Building their own | "In a few weekends using Claude Code I made … runs in AWS … costs less than $50/mo" ([link](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oicj2zz/)) | Fragile: "Claude kept re-writing duplicate functions … creating multiple sources of truth" ([same author](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oifgp1v/)) |
| Backstage or Port (devs' service catalog) | "the break-even point lands somewhere around 150-250 developers" (OP's estimate) ([link](https://www.reddit.com/r/devops/comments/1vy7t5e/at_what_team_size_does_selfhosting_backstage/)) | Too heavy for small teams; Port is "30 bucks *per dev per month*??? … My company will never ever ever pay such money." ([link](https://www.reddit.com/r/devops/comments/1kgfqys/backstage_feels_like_a_fools_errand/mr2ogye/)) |

---

## 3. Suggested MVP (must-haves only)
These are drawn from what people say they actually do or wish they had. A useful spec quote: "keep it stupid simple … No custom fields, no roles matrix, no analytics v1" ([u/Adventurous-Date9971](https://www.reddit.com/r/msp/comments/1q5qveo/is_there_a_middle_ground_between_excel_and/ny9xor1/)).

**Must-have**
1. **One record type for every app**, bought or built, with a "kind" field (SaaS, in-house, citizen-built, vendor service).
2. **A named owner plus a backup owner on every app.** The most repeated fix in the threads is "a named owner plus reminders".
3. **Dates:** renewal date, a **notice deadline that gets its own alert**, billing cycle and cost. This is the #1 pain.
4. **Reminders to the owner and backup** at roughly 90, 60 and 30 days before the notice deadline, by email, Slack or Teams. Escalate when the owner has left.
5. **Leaver check:** when someone leaves, list every app they own or pay for, and force a reassignment.
6. **CSV import and export**, so a team can move off its spreadsheet in an afternoon and leave whenever it wants.
7. **Attachments** on each record (contract, last invoice).
8. **In-house app fields:** where it runs, repo or link, what data and keys it touches, who to call, and "what breaks if this stops".
9. **Light quarterly attestation:** "still used? still owned?" A one-click reply from the owner.
10. **A flat, published price**, with no demo required.

**Leave out for now**
- Automated discovery through SSO logs or browser extensions. That's the enterprise tools' turf, and the reason their setup takes months.
- Usage and seat analytics, and waste scoring.
- Provisioning and deprovisioning automation.
- Virtual cards and payments (Cledara's lane).
- Negotiation benchmarks.
- AI contract parsing as the headline feature. A vendor-affiliated commenter warned "it is a common feature in SaaS Management apps - you won't have a great differentiator with that" ([link](https://www.reddit.com/r/msp/comments/1q5qveo/is_there_a_middle_ground_between_excel_and/ny30ytl/)).
- Automated patch-note and deprecation monitoring (weak evidence). Keep it to a "changelog URL" field.

---

## 4. Signals against the idea
- **"Just put it in your inventory."** "Also...I smell an ad. This topic keeps popping up … pushing a tool for this when it's not at all needed. Just make it part of your inventory as it should be anyway." (u/bitslammer, 33 upvotes) [link](https://www.reddit.com/r/sysadmin/comments/1oeo21h/i_swear_saas_renewals_are_slowly_turning_into_a/nl41ou5/)
- **Too few vendors to justify a tool.** "In small to medium-size companies the contract volume isn't large enough to warrant a dedicated tool, so whatever is laying around gets used." (u/mjcl) [link](https://www.reddit.com/r/sysadmin/comments/17v6e3v/contract_renewal_tracking/k98wgtv/). Also "I just don't see small businesses having so many vendors that would justify platforms like that." (u/DevinSysAdmin) [link](https://www.reddit.com/r/msp/comments/fsqrro/saas_management_products_for_small_business/fm36z2s/)
- **A calendar is free.** "It's simple, you add a reoccurring event to your calendar. Would I pay for an saas instead? No" (u/126270) [link](https://www.reddit.com/r/smallbusiness/comments/1nzqxhk/small_business_owners_how_do_you_track_all_your/ni41ceh/)
- **MSPs already have PSAs.** "I keep getting hit up by these 'SaaS' management applications and I just don't get it." (u/MSP-from-OC) [link](https://www.reddit.com/r/msp/comments/1q5qveo/is_there_a_middle_ground_between_excel_and/ny7ccn9/)
- **It's a process problem, not a tool problem.** "A named owner plus reminders is usually more valuable than a fancy renewal platform nobody updates." (u/rachel_rig) [link](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/od49k7p/)
- **Crowded and free at the low end.** Teisko (free plan), the Stitchflow renewal tracker (free), SpendHound (free), Corma (freemium), Snipe-IT and GLPI (free self-hosted), RenewalTracker ($49/mo), Cledara (£75/mo), Substly (€95/mo). Threads are saturated with vendor plugs; r/msp removes them as promotional.
- **Hostility to "validation" posts.** "All the vibecoding SaaS guys are telling people 'find a real problem people are having and try to solve it. Connect with people on Reddit to find pain points.' That's what all of these posts are." (u/OneSeaworthiness7768) [link](https://www.reddit.com/r/sysadmin/comments/1skauc1/vendor_we_fired_2_years_ago_still_has_vpn_access/ofyages/). Implication: don't do Reddit outreach. Inbound content is the better channel.
- **DIY is cheap now.** "$2-$5/employee/month is bare minimum 5x too expensive" from someone who built their own on under $50/mo of AWS ([link](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oicj2zz/)).

---

## 5. Does anyone want in-house apps tracked alongside SaaS?
**Indirectly yes, and the signal is new and strong. Nobody asked for "one register for both" in those words.**
- The top evidence is the r/devops thread on non-engineer-built apps (288 upvotes, 168 comments, Nov 2026). Its asks are inventory and ownership: "Could you actually list them? When one breaks, who finds out, and who fixes it?" ([OP](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/))
  - "Put up a PR to delete it, and say you'll merge it in 48 hours. Whoever doesn't want you to delete it, is the new owner." (u/tibbon) [link](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/19s03febqbr9e/), and the reply: "Shoot, this implies *there is a repo*." (u/imdevin567, 51 upvotes) [link](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/19s03ztneio5h/)
  - "we'll help you but we'll need to onboard it into IT if you want proper support … at least documented and vaguely enrolled" (u/TheGraycat) [link](https://www.reddit.com/r/devops/comments/1xlhrh8/how_many_apps_have_nonengineers_at_your_company/19s0plfwub0eb/)
- An older in-house app pain: "applications critical to the manufacturing of our hardware, but were made years ago by 1-2 guys who have zero documentation for the apps." [r/ITManagers](https://www.reddit.com/r/ITManagers/comments/1pyw89s/how_do_you_handle_internal_apps/)
- Another: "everybody and their mom has a website (html) from claude … Obviously, it's a governance and ownership nightmare." (u/RevolutionaryWorry87) [r/sysadmin](https://www.reddit.com/r/sysadmin/comments/1sq2mks/in_a_few_years_with_the_help_of_vibe_coding_apps/oh4vh8o/)
- One person already tracks mixed items in a single list: "This tracked certificates, licenses, subscriptions, private keys, and basically anything that expired." (u/119_seconds) [link](https://www.reddit.com/r/ITManagers/comments/1s552zv/how_do_you_track_saas_renewals_coming_from_a/oddueob/)
- Reviewers of the enterprise tools want non-SaaS coverage. Zylo Capterra review: "I wish they could provide this same service for non-SAAS products" ([Capterra](https://www.capterra.com/p/173251/Zylo/)). Stackkite also lists "Some reviewers wanted coverage beyond SaaS (non-SaaS products)" as a Zylo con ([stackkite](https://stackkite.com/software/zylo)).
- **Caveat:** the "internal app" crowd talks about ownership, security and support, not renewals or cost. So the in-house half sells on **"who owns it and what breaks"**, not on spend.

---

## 6. Price signals (summary; full log in section 9)
- **Too expensive:** enterprise SMPs at $30k–$50k a year (AWS listings and Vendr). "significantly better than an excel spreadsheet for $30k/year" ([u/CinnamonSnorlax](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oicf45j/)). Per-dev Port pricing at $30/dev/mo was called too much.
- **Prefer flat pricing:** "IT budgets usually prefer a flat fee for tools like this. $2-5 per employee adds up fast, and they'll likely just stick to the Excel sheet once the total hits a few hundred bucks a month." ([u/Less-Bite](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oidrb8v/); the same user plugs a lead tool elsewhere)
- **Contested middle:** a 4-person IT team dropped a $900/mo onboarding tool as "not worth it" for 700 users, but a top reply said "$900/month for an IAM platform for 700 users is dirt cheap" ([thread](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/)).
- **Where the cheap SaaS-spend tools sit:** about £75–£200 a month (Cledara) and €95–€190 a month (Substly), flat. Josys in Japan is ¥600 per ID per month with a 30-ID minimum, about ¥18,000 a month minimum by arithmetic.
- **No one named a "fair" price for a register like this.** The closest are the flat-fee preference and the "few hundred bucks a month" ceiling. That suggests a published flat tier well under $200 a month for small teams. This is an inference, not a quote.

---

## 7. The differentiator: the best niche segments
Shannon's goal is not to fight Torii, Zylo or Cledara on discovery or spend, so the opening is where they're absent: **ownership and continuity, across bought and built apps, for teams with no SSO-integration project budget.**

### Segment A: lean IT teams (1–5 people) at 30–500-person companies (strongest evidence)
- **Evidence:**
  - "We're a company of 30 and don't want to spend a lot of money on a saas management platform" ([OP](https://www.reddit.com/r/ITManagers/comments/175o73t/saas_management_platforms/))
  - "Most companies that size [100–500] are still using Excel or a shared Google Sheet because the dedicated tools are way too expensive." ([link](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oica3ku/))
  - "378 people now and still on sheets … Havent landed on a tool that makes sense cost-wise either" ([link](https://www.reddit.com/r/ITManagers/comments/175o73t/saas_management_platforms/neudaxb/))
  - "IT manager for a small team of four supporting a company of about 700 users … close to $900/month, it just didn't feel worth it." ([link](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/))
- **What they'd pay:** a flat fee, below "a few hundred bucks a month". The cheap competitors anchor at £75–£200 a month.
- **Positioning:** *"The renewal and ownership register for a one-to-five-person IT team: flat price, live in an afternoon from your spreadsheet, and no notice deadline missed because someone left."*

### Segment B: companies whose staff now build their own apps (most differentiated, least price data)
- **Evidence:**
  - The r/devops thread on non-engineer apps (288 upvotes) and the r/sysadmin vibe-coding thread ([link](https://www.reddit.com/r/sysadmin/comments/1sq2mks/in_a_few_years_with_the_help_of_vibe_coding_apps/))
  - The undocumented manufacturing apps on r/ITManagers
  - Backstage and Port being too heavy or pricey below roughly 150–250 developers
  - Zylo reviewers wanting non-SaaS coverage
- **What they'd pay:** no direct quote. The only anchor is that $30 per dev per month (Port) was called unaffordable, so per-seat developer pricing is risky. Flat pricing fits.
- **Positioning:** *"One list for the apps you buy and the apps your people build: every one has an owner, a backup, and a 'what breaks if this stops' note, before the person who built it leaves."*

### Segment C (conditional): small MSPs and one-person IT providers without a PSA
- **Evidence:**
  - "1 man show here … I don't use a PSA. Most are a PITA and expensive for my usage." ([u/ArchonTheta](https://www.reddit.com/r/msp/comments/1qu8w93/how_do_you_actually_track_billing_renewals/o3f6z3g/))
  - "Small MSP here (400 seats) … I'm using Excel sheets per service … realized I've underbilled ~€5,000 over the last 3–4 months." ([OP](https://www.reddit.com/r/msp/comments/1qu8w93/how_do_you_actually_track_billing_renewals/))
  - An accounting-firm client with 12+ SaaS tools tracked in Excel ([thread](https://www.reddit.com/r/msp/comments/fsqrro/saas_management_products_for_small_business/))
- **Against:** bigger MSPs say a PSA plus Pax8, Gradient or CloudOlive already does this, and BetterTracker already sells an MSP plan at $29.93 per client per month (annual).
- **What they'd pay:** BetterTracker's per-client price is the visible anchor. No user-stated fair price was found.
- **Positioning:** *"A multi-client app register for the MSP too small for a PSA: every client's renewals, notice dates and owners in one view."*

**Not supported by evidence (yet):** family offices and holding companies (no posts found), nonprofits (only a vendor page), and web agencies. Agencies' felt pain is "is the client site broken?", which uptime and testing tools already serve ([r/webdev](https://www.reddit.com/r/webdev/comments/1p70xo7/im_managing_8_client_sites_constantly_worried/)).

---

## 8. Content hooks for inbound posts and videos (owner-level, no AI lead)
1. **"Your renewal date isn't your deadline. Your notice date is."** One company asks for 90 days' written notice; one buyer missed it by 10 days and paid for a full year.
2. **"Who owns this app?"** The app that broke after its builder left, and the three questions every business should be able to answer for every tool: who owns it, who's the backup, what breaks if it stops.
3. **"Five subscriptions to the same tool, on three cards."** How duplicate tools happen when buying is easy and checking isn't.
4. **"The spreadsheet is only right on renewal day."** Why lists go stale, and the one habit (a named owner plus a monthly glance) that fixes most of it, with or without a tool.
5. **"The vendor you fired still has a key."** Offboarding people and offboarding suppliers, and why both belong on the same checklist.

---

## 9. Price log
| Amount | Period / basis | Tool | Who said it (segment, size) | Type | Link |
|---|---|---|---|---|---|
| $32,000 median ($14,000–$53,533) | per year | Torii | Vendr buyer data, 53 purchases | Competitor, buyer-paid | [vendr](https://www.vendr.com/marketplace/torii) |
| $15,000–$35,000 | per year | Torii | Vendr, 100–500-employee deployments | Competitor, buyer-paid | [vendr](https://www.vendr.com/marketplace/torii) |
| $30,000 | 12-month contract (Core Platform) | Torii | AWS Marketplace listing | Competitor list | [aws](https://aws.amazon.com/marketplace/pp/prodview-2ivpaavvbdtug) |
| $50,000 | 12-month contract | Zylo | AWS Marketplace listing | Competitor list | [aws](https://aws.amazon.com/marketplace/pp/prodview-amjjpn3byw55c) |
| about $34,870 median | per year | Zylo | Vendr via stackkite (third-party), 20 purchases | Competitor, buyer-paid | [stackkite](https://stackkite.com/software/zylo) |
| about $35,000 | per year | Zylo | u/ftruong, 1,000+ employee company ("saved about $150k") | Paid, positive | [reddit](https://www.reddit.com/r/ITManagers/comments/1l9qz96/how_do_you_track_saas_usage_and_waste_internally/nmwmees/) |
| "Price is too high for what they have to offer" | n/a | Zylo | G2 reviewer, mid-market (51–1000) | Too expensive | [G2](https://www.g2.com/products/zylo/reviews) |
| 90-day written notice required to terminate | contract term | Zylo | G2 reviewer, mid-market | Contract trap | [G2](https://www.g2.com/products/zylo/reviews) |
| $30,000 | 12-month contract, companies under 300 employees | Productiv | AWS Marketplace listing | Competitor list | [aws](https://aws.amazon.com/marketplace/pp/prodview-yifwxwea6qgro) |
| $45,062 median ($17,000–$104,871) | per year | BetterCloud | Vendr data via getpricepulse, 196 purchases | Competitor, buyer-paid | [getpricepulse](https://www.getpricepulse.com/blog/best-saas-spend-management-tools-2026.html) |
| "reasonably high price tag" | n/a | BetterCloud | G2 reviewer, mid-market | Too expensive | [G2](https://www.g2.com/products/bettercloud/reviews?page=10&qs=pros-and-cons) |
| $36,820 median | per year | Zluri | Vendr data via getpricepulse | Competitor, buyer-paid | [getpricepulse](https://www.getpricepulse.com/blog/best-saas-spend-management-tools-2026.html) |
| £75 (£750/yr), up to 20 apps | per month | Cledara Basic | Cledara pricing page | Competitor list | [cledara](https://www.cledara.com/pricing) |
| £200 (£2,000/yr), up to 75 apps | per month | Cledara Premium | Cledara pricing page | Competitor list | [cledara](https://www.cledara.com/pricing) |
| from £500 (from £5,000/yr) | per month | Cledara Pro | Cledara pricing page | Competitor list | [cledara](https://www.cledara.com/pricing) |
| £150 per module; £200 per Agent job | per month, add-on | Cledara add-ons | Cledara pricing page | Competitor list | [cledara](https://www.cledara.com/pricing) |
| Basic changed from free to £75 | change logged 1 Nov 2026 | Cledara | toolradar tracker (third-party) | Price change | [toolradar](https://toolradar.com/tools/cledara) |
| €95 yearly / €120 monthly ($105 / $130) | per month, flat | Substly Monitor | Substly pricing page | Competitor list | [substly](https://www.substly.com/en/pricing/) |
| €190 yearly / €240 monthly ($210 / $260) | per month, flat | Substly Optimize | Substly pricing page | Competitor list | [substly](https://www.substly.com/en/pricing/) |
| ¥600 (¥660 incl. tax) per ID, minimum 30 IDs, annual, 45 days' notice to cancel | per ID per month | Josys SaaS Management (via NTT Docomo Business) | Reseller page | Competitor list | [ntt](https://www.ntt.com/business/services/josys.html) |
| ¥900 (¥990 incl. tax) per ID | per ID per month | Josys Access Management | Reseller page | Competitor list | [ntt](https://www.ntt.com/business/services/josys.html) |
| Quote only, per identity | n/a | Josys (global) | Josys pricing page | Competitor list | [josys](https://www.josys.com/pricing) |
| €3 per employee (annual); freemium up to 10 apps | per employee per month | Corma Essential | Search summary of corma.io (page not opened) | Competitor list | [corma](https://www.corma.io/pricing) |
| $0, up to 100 managed users | free plan | Teisko | Search summary of teisko.com (page not opened) | Competitor list | [teisko](https://teisko.com/pricing/) |
| $49 / $69 | per month | RenewalTracker Basic / Basic Plus | Search summary of their pricing page (not opened) | Competitor list | [renewaltracker](https://www.renewaltracker.com/pricing) |
| from $125/mo ($1,188/yr) up to $3,399/mo ($32,388/yr) | per month, by user count | BetterTracker (business) | BetterTracker pricing page | Competitor list | [bettertracker](https://bettertracker.com/pricing/) |
| $399/mo for 10 clients ($29.93 per client per month annual) | per month | BetterTracker (MSP) | BetterTracker pricing page | Competitor list | [bettertracker](https://bettertracker.com/pricing/) |
| from $3,083 | per month | Tropic (procurement service) | getpricepulse | Competitor list | [getpricepulse](https://www.getpricepulse.com/blog/best-saas-spend-management-tools-2026.html) |
| $5 per user ("early adopter pricing") | per user per month | Stitchflow | u/yenceesanjeev (affiliated with Stitchflow) | Vendor-stated | [reddit](https://www.reddit.com/r/ITManagers/comments/1kmfwr3/anyone_struggling_with_saas_usage_tracking/mse3j5n/) |
| $2–5 per employee "adds up fast"; Excel wins once the total hits "a few hundred bucks a month" | per employee per month | SaaS management tools (generic) | u/Less-Bite, about 100–500-person companies | Too expensive / ceiling | [reddit](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oidrb8v/) |
| "$2-$5/employee/month is bare minimum 5x too expensive"; DIY under $50/mo | per employee per month | SaaS management tools vs DIY on AWS | u/Infinite-Jelly-3182, IT at a 100–500-person company | Too expensive | [reddit](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oicj2zz/) |
| $30,000 | per year | Hypothetical tool vs Excel | u/CinnamonSnorlax, about 100–500-person companies | Too expensive | [reddit](https://www.reddit.com/r/ITManagers/comments/1sw1ajk/it_managers_at_100500_person_companies_how_do_you/oicf45j/) |
| close to $900 | per month | Joinly (onboarding and offboarding) | OP, 4-person IT team, 700 users | Too expensive | [reddit](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/) |
| $900/mo for 700 users is "dirt cheap" | per month | IAM platform (generic) | u/Ihaveasmallwang (reply) | Fair / cheap | [reddit](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/otbdxnt/) |
| about $250 | per month | DIY Azure Logic App for joiners and leavers | u/CruwL, about 900 users | DIY cost | [reddit](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/otbg322/) |
| about £60 per agent | per agent per month | Halo (ITSM) | u/Colink98 | Paid | [reddit](https://www.reddit.com/r/sysadmin/comments/1udfuqi/affordable_onboardingoffboarding_automation_tools/otbesyk/) |
| $6,600 to $400 | per year | Asset Panda to Snipe-IT | u/Doublestack00 (left Asset Panda "due to cost") | Too expensive / switched | [reddit](https://www.reddit.com/r/sysadmin/comments/1lf9a1z/currently_using_asset_panda_our_renewal_came_back/n26n7wi/) |
| about $1,000 | per year | Snipe-IT (hosted tier) | u/tantan350, about 650 employees | Paid | [reddit](https://www.reddit.com/r/sysadmin/comments/1lf9a1z/currently_using_asset_panda_our_renewal_came_back/myrfo4r/) |
| €19 for up to 10 users (cloud); free self-hosted | per month (as stated) | GLPI | u/Acardul | Competitor price (user-reported) | [reddit](https://www.reddit.com/r/sysadmin/comments/1lf9a1z/currently_using_asset_panda_our_renewal_came_back/mynig2e/) |
| $30 per developer | per developer per month | Port (developer portal) | u/RustOnTheEdge: "My company will never ever ever pay such money." | Too expensive | [reddit](https://www.reddit.com/r/devops/comments/1kgfqys/backstage_feels_like_a_fools_errand/mr2ogye/) |
| "why is your software $500 a month?" | per month | License-audit software (hypothetical) | u/Spagman_Aus | Too expensive | [reddit](https://www.reddit.com/r/ITManagers/comments/1px9zsw/it_license_optimization_consulting_would_you_pay/nw9omo9/) |
| $900/mo on duplicate Notion vs about $500 for one plan | per month | Waste example (Notion) | OP, r/smallbusiness | Cost of the problem | [reddit](https://www.reddit.com/r/smallbusiness/comments/1or3gas/we_have_5_subscriptions_of_the_same_software/) |
| about €5,000 underbilled over 3–4 months | one-off loss | MSP billing drift (Excel) | OP, small MSP, 400 seats | Cost of the problem | [reddit](https://www.reddit.com/r/msp/comments/1qu8w93/how_do_you_actually_track_billing_renewals/) |
| $200 surprise invoice | one-off | Forgotten SaaS | u/AdVivid5763 | Cost of the problem | [reddit](https://www.reddit.com/r/sysadmin/comments/1oeo21h/i_swear_saas_renewals_are_slowly_turning_into_a/nl2xzi7/) |

Note on Japan (X): the evidence is anecdotal. Examples:
- "2022年ごろ、同社はSaaSも端末もGoogleスプレッドシートで管理していました。上場準備の審査をきっかけにSaaS管理サービスを入れました" ("Around 2022 the company managed both SaaS and devices in Google Sheets, and adopted a SaaS management service when IPO-readiness review forced it") [@nouma__official](https://x.com/nouma__official/status/2121083129742110910)
- People are selling a "全社SaaS棚卸しスプレッドシート" (company-wide SaaS inventory spreadsheet) template, which suggests spreadsheets are the default there too ([@trendpulse_day_](https://x.com/trendpulse_day_/status/2119644464130216344)).
