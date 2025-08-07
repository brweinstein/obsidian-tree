import { Plugin, WorkspaceLeaf, MarkdownView } from "obsidian";
import { TreeView, VIEW_TYPE_TREE } from "./tree-view";

export default class TreeNavigatorPlugin extends Plugin {
  private lastLeaf: WorkspaceLeaf | null = null;

  onload() {
    // 1) Register our custom TreeView
    this.registerView(
      VIEW_TYPE_TREE,
      (leaf) => new TreeView(leaf, () => this.activateView())
    );

    // 2) Ribbon icon to toggle view
    this.addRibbonIcon("folder", "Toggle tree", () =>
      this.activateView()
    );

    // 3) Command without plugin name or default hotkey
    this.addCommand({
      id: "toggle-tree-navigator",
      name: "Toggle tree",
      callback: () => this.activateView(),
    });
  }

  public async activateView() {
    // A) If TreeView is active, return to last Markdown leaf
    const inTree = this.app.workspace.getActiveViewOfType(TreeView);
    if (inTree && this.lastLeaf) {
      this.app.workspace.setActiveLeaf(this.lastLeaf);
      return;
    }

    // B) If current is Markdown, stash that leaf
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView) {
      const viewType = mdView.getViewType();
      this.lastLeaf =
        this.app.workspace
          .getLeavesOfType(viewType)
          .find((l) => l.view === mdView) ?? null;
    }

    // C) Find or create the TreeView leaf
    let treeLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_TREE)[0];
    if (!treeLeaf) {
      const left = this.app.workspace.getLeftLeaf(false);
      treeLeaf = left ?? this.app.workspace.getLeaf("split");
    }

    // D) Reveal & activate
    await treeLeaf.setViewState({ type: VIEW_TYPE_TREE, active: true });
    this.app.workspace.revealLeaf(treeLeaf);

    // E) Focus inside the TreeView
    const view = treeLeaf.view;
    if (view instanceof TreeView) {
      view.focusContainer();
      view.focusFirstItem();
    }
  }
}