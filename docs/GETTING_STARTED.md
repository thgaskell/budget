# Getting Started with Budget CLI

This guide walks you through setting up your first budget using the Budget CLI. By the end, you'll understand the core concepts of envelope budgeting and how to use the tool effectively.

## What is Envelope Budgeting?

Envelope budgeting is a method where you allocate every dollar of income to a specific category (or "envelope") before you spend it. Key principles:

1. **Give Every Dollar a Job**: All income gets assigned to categories
2. **Embrace Your True Expenses**: Budget for irregular expenses monthly
3. **Roll With the Punches**: Move money between categories as needed
4. **Age Your Money**: Build a buffer so you're spending last month's income

## Installation

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Clone and build
git clone https://github.com/thgaskell/budget.git
cd budget
bun install
cd cli && bun run build

# Verify installation
./dist/budget --version
```

## Example 1: College Student Budget

Let's set up a budget for a college student with $1,200/month income.

### Step 1: Create Budget and Account

```bash
# Create a fresh budget
budget create "College Budget"
budget use "College Budget"

# Add your bank account
budget account add "Student Checking" --type checking
```

### Step 2: Set Up Categories

Organize your spending into logical groups:

```bash
# Create groups
budget group add "Essentials"
budget group add "Education"
budget group add "Personal"
budget group add "Savings"
budget group add "Fun"

# Create categories
budget category add "Rent" --group "Essentials"
budget category add "Utilities" --group "Essentials"
budget category add "Groceries" --group "Essentials"
budget category add "Transportation" --group "Essentials"

budget category add "Books" --group "Education"
budget category add "Supplies" --group "Education"

budget category add "Phone" --group "Personal"
budget category add "Toiletries" --group "Personal"

budget category add "Emergency Fund" --group "Savings"

budget category add "Entertainment" --group "Fun"
budget category add "Eating Out" --group "Fun"
```

### Step 3: Add Income and Assign

```bash
# Add your paycheck
budget tx add --account "Student Checking" --amount 1200 --payee "Part-time Job"

# Check what you have to assign
budget available
# Output: Ready to Assign: $1,200.00

# Assign to categories (essentials first!)
budget assign "Rent" 500
budget assign "Utilities" 50
budget assign "Groceries" 150
budget assign "Transportation" 50
budget assign "Books" 30
budget assign "Supplies" 20
budget assign "Phone" 40
budget assign "Toiletries" 20
budget assign "Emergency Fund" 100
budget assign "Entertainment" 40
budget assign "Eating Out" 200

# Verify zero-based
budget available
# Output: Ready to Assign: $0.00
# All money is assigned. Zero-based budget achieved!
```

### Step 4: Record Spending

```bash
# Pay rent
budget tx add --account "Student Checking" --amount -500 --payee "Landlord" --category "Rent"

# Buy groceries
budget tx add --account "Student Checking" --amount -45.67 --payee "Grocery Store" --category "Groceries"

# Check your status
budget status
```

Output:
```
Budget Status - December 2024
Ready to Assign: $0.00

┌─────────────────┬──────────┬──────────┬───────────┐
│ Category        │ Assigned │ Activity │ Available │
├─────────────────┼──────────┼──────────┼───────────┤
│ Essentials      │          │          │           │
│   Rent          │ $500.00  │ -$500.00 │ $0.00     │
│   Groceries     │ $150.00  │ -$45.67  │ $104.33   │
│   ...           │          │          │           │
└─────────────────┴──────────┴──────────┴───────────┘
```

### Step 5: Handle Overspending

What if you overspend on Entertainment?

```bash
# Oops, spent $60 but only budgeted $40
budget tx add --account "Student Checking" --amount -60 --payee "Concert" --category "Entertainment"

# Check status - Entertainment shows -$20
budget status

# Move money from Eating Out to cover it
budget move "Eating Out" "Entertainment" 20

# Now Entertainment is $0 and Eating Out is $80
budget status
```

## Example 2: Family Budget with 50/30/20 Rule

For a family earning $6,500/month using the 50/30/20 rule:
- 50% Needs ($3,250)
- 30% Wants ($1,950)
- 20% Savings ($1,300)

```bash
budget create "Family Budget"
budget use "Family Budget"
budget account add "Joint Checking" --type checking

# Create groups matching 50/30/20
budget group add "Needs"
budget group add "Wants"
budget group add "Savings"

# Needs (50%)
budget category add "Mortgage" --group "Needs"
budget category add "Utilities" --group "Needs"
budget category add "Groceries" --group "Needs"
budget category add "Insurance" --group "Needs"
budget category add "Transportation" --group "Needs"

# Wants (30%)
budget category add "Dining Out" --group "Wants"
budget category add "Entertainment" --group "Wants"
budget category add "Shopping" --group "Wants"
budget category add "Hobbies" --group "Wants"

# Savings (20%)
budget category add "Emergency Fund" --group "Savings"
budget category add "Retirement" --group "Savings"
budget category add "Kids College" --group "Savings"

# Add income
budget tx add --account "Joint Checking" --amount 6500 --payee "Employer"

# Assign following 50/30/20
budget assign "Mortgage" 1800
budget assign "Utilities" 300
budget assign "Groceries" 600
budget assign "Insurance" 250
budget assign "Transportation" 300

budget assign "Dining Out" 400
budget assign "Entertainment" 300
budget assign "Shopping" 500
budget assign "Hobbies" 350

budget assign "Emergency Fund" 500
budget assign "Retirement" 500
budget assign "Kids College" 300

# Leftover goes to additional savings
budget assign "Emergency Fund" 900  # Increases to $900

budget available
# Ready to Assign: $0.00
```

## Example 3: Freelancer with Variable Income

For freelancers with irregular income, the key is building a buffer.

```bash
budget create "Freelance Budget"
budget use "Freelance Budget"
budget account add "Business Checking" --type checking

# Groups with buffer emphasis
budget group add "Fixed Costs"
budget group add "Variable Costs"
budget group add "Taxes"
budget group add "Buffer"
budget group add "Lifestyle"

# Fixed (must pay every month)
budget category add "Rent" --group "Fixed Costs"
budget category add "Utilities" --group "Fixed Costs"
budget category add "Insurance" --group "Fixed Costs"
budget category add "Subscriptions" --group "Fixed Costs"

# Variable
budget category add "Groceries" --group "Variable Costs"
budget category add "Transportation" --group "Variable Costs"

# Taxes (set aside ~25-30%)
budget category add "Quarterly Taxes" --group "Taxes"

# Buffer (your safety net)
budget category add "Income Buffer" --group "Buffer"
budget category add "Emergency Fund" --group "Buffer"

# Lifestyle (only after buffer is built)
budget category add "Entertainment" --group "Lifestyle"
budget category add "Dining" --group "Lifestyle"

# Good month: $5,000 income
budget tx add --account "Business Checking" --amount 5000 --payee "Client Project"

# First: Set aside taxes (25%)
budget assign "Quarterly Taxes" 1250

# Second: Cover fixed costs
budget assign "Rent" 1200
budget assign "Utilities" 100
budget assign "Insurance" 150
budget assign "Subscriptions" 50

# Third: Variable costs
budget assign "Groceries" 300
budget assign "Transportation" 100

# Fourth: Build buffer (remaining $1,700)
budget assign "Income Buffer" 1000
budget assign "Emergency Fund" 700

# Finally: Lifestyle with what's left
budget assign "Entertainment" 75
budget assign "Dining" 75

budget available
# Ready to Assign: $0.00
```

### Handling a Lean Month

```bash
# Next month: Only $2,000 income
budget tx add --account "Business Checking" --amount 2000 --payee "Small Project" --date 2025-02-01

# View February status
budget status --month 2025-02

# Not enough to cover everything! Move from buffer:
budget move "Income Buffer" "Rent" 400 --month 2025-02
```

## Example 4: Using Different Months

You can view and manage any month:

```bash
# View current month
budget status

# View specific month
budget status --month 2025-01
budget status --month 2025-02

# Assign for future months
budget assign "Vacation" 200 --month 2025-06

# See how categories accumulate
budget status --month 2025-06
# Vacation shows $200 Available (saved for summer!)
```

## Understanding Carryover

Unspent money in categories automatically carries forward:

```bash
# December: Budget $300 for groceries, spend $250
budget assign "Groceries" 300 --month 2024-12
budget tx add --account "Checking" --amount -250 --payee "Store" --category "Groceries" --date 2024-12-15

# Check December
budget status --month 2024-12
# Groceries: Assigned $300, Activity -$250, Available $50

# Check January (before any new assignments)
budget status --month 2025-01
# Groceries: Assigned $0, Activity $0, Available $50  <- Carryover!

# Now assign for January
budget assign "Groceries" 300 --month 2025-01

budget status --month 2025-01
# Groceries: Assigned $300, Activity $0, Available $350  <- $300 + $50 carryover
```

**Negative carryover works too!** If you overspend, that debt carries forward:

```bash
# Overspend on dining
budget status --month 2024-12
# Dining: Assigned $100, Activity -$150, Available -$50

budget status --month 2025-01
# Dining: Assigned $0, Activity $0, Available -$50  <- You owe this category!
```

## Tips for Success

1. **Budget to Zero**: Always assign all income. Use `budget available` to check.

2. **Priorities First**: Assign to needs before wants, savings before fun.

3. **Check Weekly**: Run `budget status` regularly to stay on track.

4. **Move Don't Add**: When overspending, move from another category rather than adding more.

5. **Build Buffer**: Aim to have one month's expenses in your buffer categories.

6. **Use JSON for Scripts**: Add `--json` for machine-readable output:
   ```bash
   budget status --json | jq '.groups[].categories[] | select(.balances.available < 0)'
   ```

## Next Steps

- Set up [targets](../README.md#targets) for savings goals
- Explore [transaction filtering](../README.md#transactions) 
- Try [multiple accounts](../README.md#account-management) for complex setups
