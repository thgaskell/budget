import { Command } from 'commander'
import {
  createCategory,
  createCategoryGroup,
} from '@budget/core'
import { getStore, saveStore } from '../store.ts'
import { requireActiveBudgetId } from '../config.ts'
import {
  outputSuccess,
  outputError,
  outputTable,
  colors,
  type OutputOptions,
} from '../output.ts'

/**
 * Find a category group by ID or name within the active budget.
 */
function findCategoryGroup(
  store: ReturnType<typeof getStore>,
  budgetId: string,
  idOrName: string
) {
  const groups = store.listCategoryGroups(budgetId)
  let group = groups.find((g) => g.id === idOrName)
  if (!group) {
    group = groups.find((g) => g.name.toLowerCase() === idOrName.toLowerCase())
  }
  return group
}

/**
 * Register category commands.
 */
export function registerCategoryCommands(program: Command): void {
  const category = program
    .command('category')
    .description('Category management commands')

  // category add <name>
  category
    .command('add <name>')
    .description('Create a new category')
    .requiredOption('--group <id|name>', 'Category group ID or name')
    .action(async (name: string, opts: { group: string }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        // Find group
        const group = findCategoryGroup(store, budgetId, opts.group)
        if (!group) {
          throw new Error(`Category group not found: ${opts.group}`)
        }

        // Get sort order
        const existingCategories = store
          .listCategories(budgetId)
          .filter((c) => c.groupId === group.id)
        const sortOrder =
          existingCategories.length > 0
            ? Math.max(...existingCategories.map((c) => c.sortOrder)) + 1
            : 0

        const cat = createCategory({
          groupId: group.id,
          name,
          sortOrder,
        })

        store.saveCategory(cat)
        saveStore()

        outputSuccess(`Created category: ${cat.name} in ${group.name}`, options, cat)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // category list
  category
    .command('list')
    .description('List all categories grouped')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const groups = store.listCategoryGroups(budgetId)
        const categories = store.listCategories(budgetId)

        if (options.json) {
          const data = groups.map((group) => ({
            ...group,
            categories: categories.filter((c) => c.groupId === group.id),
          }))
          console.log(JSON.stringify(data, null, 2))
        } else if (options.quiet) {
          for (const cat of categories) {
            console.log(cat.id)
          }
        } else {
          if (groups.length === 0) {
            console.log(
              colors.dim(
                'No category groups found. Create one with "budget group add <name>".'
              )
            )
            return
          }

          for (const group of groups) {
            console.log(colors.bold(group.name))
            const groupCategories = categories.filter(
              (c) => c.groupId === group.id
            )
            if (groupCategories.length === 0) {
              console.log(colors.dim('  (no categories)'))
            } else {
              for (const cat of groupCategories) {
                console.log(`  ${cat.name} (${cat.id.substring(0, 8)}...)`)
              }
            }
            console.log()
          }
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // category delete <id>
  category
    .command('delete <id>')
    .description('Delete a category')
    .option('--force', 'Skip confirmation')
    .action(async (id: string, _opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const cat = store.getCategory(id)
        if (!cat) {
          throw new Error(`Category not found: ${id}`)
        }

        // Verify it belongs to active budget
        const group = store.getCategoryGroup(cat.groupId)
        if (group?.budgetId !== budgetId) {
          throw new Error('Category does not belong to the active budget.')
        }

        store.deleteCategory(id)
        saveStore()

        outputSuccess(`Deleted category: ${cat.name}`, options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}

/**
 * Register category group commands.
 */
export function registerGroupCommands(program: Command): void {
  const group = program
    .command('group')
    .description('Category group management commands')

  // group add <name>
  group
    .command('add <name>')
    .description('Create a new category group')
    .action(async (name: string) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        // Get sort order
        const existingGroups = store.listCategoryGroups(budgetId)
        const sortOrder =
          existingGroups.length > 0
            ? Math.max(...existingGroups.map((g) => g.sortOrder)) + 1
            : 0

        const categoryGroup = createCategoryGroup({
          budgetId,
          name,
          sortOrder,
        })

        store.saveCategoryGroup(categoryGroup)
        saveStore()

        outputSuccess(`Created category group: ${categoryGroup.name}`, options, categoryGroup)
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // group list
  group
    .command('list')
    .description('List category groups')
    .action(async () => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()
        const groups = store.listCategoryGroups(budgetId)

        if (options.json) {
          console.log(JSON.stringify(groups, null, 2))
        } else if (options.quiet) {
          for (const g of groups) {
            console.log(g.id)
          }
        } else {
          if (groups.length === 0) {
            console.log(
              colors.dim(
                'No category groups found. Create one with "budget group add <name>".'
              )
            )
            return
          }

          const categories = store.listCategories(budgetId)
          outputTable(
            ['ID', 'Name', 'Categories'],
            groups.map((g) => {
              const count = categories.filter((c) => c.groupId === g.id).length
              return [g.id.substring(0, 8) + '...', g.name, count]
            }),
            options
          )
        }
      } catch (error) {
        outputError(error as Error, options)
      }
    })

  // group delete <id>
  group
    .command('delete <id>')
    .description('Delete a category group')
    .option('--force', 'Skip confirmation and delete categories')
    .action(async (id: string, opts: { force?: boolean }) => {
      const options = program.opts() as OutputOptions
      try {
        const budgetId = requireActiveBudgetId()
        const store = getStore()

        const categoryGroup = store.getCategoryGroup(id)
        if (!categoryGroup) {
          throw new Error(`Category group not found: ${id}`)
        }

        if (categoryGroup.budgetId !== budgetId) {
          throw new Error('Category group does not belong to the active budget.')
        }

        // Check for categories
        const categories = store
          .listCategories(budgetId)
          .filter((c) => c.groupId === id)

        if (categories.length > 0 && !opts.force) {
          throw new Error(
            `Group has ${categories.length} categories. Use --force to delete them.`
          )
        }

        // Delete categories first
        for (const cat of categories) {
          store.deleteCategory(cat.id)
        }

        store.deleteCategoryGroup(id)
        saveStore()

        outputSuccess(`Deleted category group: ${categoryGroup.name}`, options, { id })
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
