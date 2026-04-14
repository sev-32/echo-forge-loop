"""First-pass causal graph for the persisted ION kernel records.

This graph is intentionally narrower than the older semantic bond system. It models
the explicit causal/runtime relationships already present in the current kernel
records so later runtime and compiler work can traverse them directly.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass

from .index import KernelIndex
from .model import AutomationStateRecord, CommitDelta, ContextPackage, ManifestRouteStateRecord, OpenQuestion, PlannerManifest, PlannerManifestSweepAggregateRecord, PlannerManifestSweepReceipt, QuestionAnswerRecord, ReviewerAnswerQueueProjectionRecord, ReviewerQueueRefreshReceipt, StrEnum, WorkUnit


class GraphEdgeType(StrEnum):
    CONTEXT_FOR = "CONTEXT_FOR"
    ENABLES_WORK = "ENABLES_WORK"
    SPAWNS_CHILD = "SPAWNS_CHILD"
    EMITS_DELTA = "EMITS_DELTA"
    CONTEXT_FOR_DELTA = "CONTEXT_FOR_DELTA"
    RAISES_QUESTION = "RAISES_QUESTION"
    PARENT_QUESTION_FOR = "PARENT_QUESTION_FOR"
    BLOCKS_WORK = "BLOCKS_WORK"
    ANSWERS_QUESTION = "ANSWERS_QUESTION"
    ANSWER_FOR_WORK = "ANSWER_FOR_WORK"
    QUEUES_PENDING_QUESTION = "QUEUES_PENDING_QUESTION"
    PROJECTS_ANSWER_RECORD = "PROJECTS_ANSWER_RECORD"
    REFRESHES_QUEUE_PROJECTION = "REFRESHES_QUEUE_PROJECTION"
    QUESTION_FOR_MANIFEST = "QUESTION_FOR_MANIFEST"
    DELTA_FOR_MANIFEST = "DELTA_FOR_MANIFEST"
    SWEEPS_MANIFEST = "SWEEPS_MANIFEST"
    AGGREGATES_SWEEP_RECEIPT = "AGGREGATES_SWEEP_RECEIPT"
    MANIFEST_FOR_WORK = "MANIFEST_FOR_WORK"
    AUTOMATION_FOR_WORK = "AUTOMATION_FOR_WORK"
    MANIFEST_BINDS_AUTOMATION = "MANIFEST_BINDS_AUTOMATION"


@dataclass(frozen=True)
class GraphEdge:
    source: str
    target: str
    edge_type: GraphEdgeType


class KernelGraph:
    """Directed causal graph over the first-pass kernel record stack."""

    _RECORD_TYPES = ("work_unit", "context_package", "commit_delta", "open_question", "question_answer", "reviewer_answer_queue", "reviewer_queue_refresh", "planner_manifest", "planner_manifest_sweep", "planner_manifest_sweep_aggregate", "manifest_route_state", "automation_state")

    def __init__(self) -> None:
        self.clear()

    def clear(self) -> None:
        self._adj: dict[str, list[GraphEdge]] = defaultdict(list)
        self._rev: dict[str, list[GraphEdge]] = defaultdict(list)
        self._nodes: set[str] = set()

    @staticmethod
    def node_id(record_type: str, record_id: str) -> str:
        return f"{record_type}:{record_id}"

    def build_from_index(self, index: KernelIndex) -> int:
        """Build the graph from the current indexed kernel records."""

        self.clear()

        for record_type in self._RECORD_TYPES:
            for record in index.records_by_type(record_type):
                self._nodes.add(self._node_for_record(record))

        for context_package in index.records_by_type("context_package"):
            self._link_context_package(index, context_package)
        for work_unit in index.records_by_type("work_unit"):
            self._link_work_unit(index, work_unit)
        for commit_delta in index.records_by_type("commit_delta"):
            self._link_commit_delta(index, commit_delta)
        for open_question in index.records_by_type("open_question"):
            self._link_open_question(index, open_question)
        for question_answer in index.records_by_type("question_answer"):
            self._link_question_answer(index, question_answer)
        for reviewer_queue in index.records_by_type("reviewer_answer_queue"):
            self._link_reviewer_answer_queue(index, reviewer_queue)
        for queue_refresh in index.records_by_type("reviewer_queue_refresh"):
            self._link_reviewer_queue_refresh(index, queue_refresh)
        for planner_manifest in index.records_by_type("planner_manifest"):
            self._link_planner_manifest(index, planner_manifest)
        for planner_sweep in index.records_by_type("planner_manifest_sweep"):
            self._link_planner_manifest_sweep(index, planner_sweep)
        for sweep_aggregate in index.records_by_type("planner_manifest_sweep_aggregate"):
            self._link_planner_manifest_sweep_aggregate(index, sweep_aggregate)
        for manifest_state in index.records_by_type("manifest_route_state"):
            self._link_manifest_route_state(index, manifest_state)
        for automation_state in index.records_by_type("automation_state"):
            self._link_automation_state(index, automation_state)

        return self.edge_count

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return sum(len(edges) for edges in self._adj.values())

    def has_node(self, node_id: str) -> bool:
        return node_id in self._nodes

    def neighbors(self, node_id: str, edge_type: GraphEdgeType | None = None) -> list[str]:
        edges = self._adj.get(node_id, [])
        rendered = [
            edge.target
            for edge in edges
            if edge_type is None or edge.edge_type is edge_type
        ]
        return list(dict.fromkeys(rendered))

    def predecessors(self, node_id: str, edge_type: GraphEdgeType | None = None) -> list[str]:
        edges = self._rev.get(node_id, [])
        rendered = [
            edge.source
            for edge in edges
            if edge_type is None or edge.edge_type is edge_type
        ]
        return list(dict.fromkeys(rendered))

    def edges_from(self, node_id: str, edge_type: GraphEdgeType | None = None) -> list[GraphEdge]:
        edges = self._adj.get(node_id, [])
        if edge_type is None:
            return list(edges)
        return [edge for edge in edges if edge.edge_type is edge_type]

    def shortest_path(self, from_node: str, to_node: str) -> list[str] | None:
        if from_node not in self._nodes or to_node not in self._nodes:
            return None
        if from_node == to_node:
            return [from_node]

        visited = {from_node}
        queue = deque([(from_node, [from_node])])

        while queue:
            node, path = queue.popleft()
            for edge in self._adj.get(node, []):
                if edge.target == to_node:
                    return path + [edge.target]
                if edge.target not in visited:
                    visited.add(edge.target)
                    queue.append((edge.target, path + [edge.target]))
        return None

    def reachable(self, root_node: str, depth: int = -1) -> set[str]:
        if root_node not in self._nodes:
            return set()

        visited = set()
        queue = deque([(root_node, 0)])
        while queue:
            node, current_depth = queue.popleft()
            if node in visited:
                continue
            if depth >= 0 and current_depth > depth:
                continue
            visited.add(node)
            for edge in self._adj.get(node, []):
                queue.append((edge.target, current_depth + 1))
        return visited

    def topological_sort(self) -> list[str]:
        in_degree = {node: 0 for node in self._nodes}
        for edges in self._adj.values():
            for edge in edges:
                in_degree[edge.target] = in_degree.get(edge.target, 0) + 1

        queue = deque(sorted(node for node, degree in in_degree.items() if degree == 0))
        result: list[str] = []

        while queue:
            node = queue.popleft()
            result.append(node)
            for edge in self._adj.get(node, []):
                in_degree[edge.target] -= 1
                if in_degree[edge.target] == 0:
                    queue.append(edge.target)
        return result

    def has_cycles(self) -> bool:
        return len(self.topological_sort()) != len(self._nodes)

    def connected_components(self) -> list[set[str]]:
        visited: set[str] = set()
        components: list[set[str]] = []

        for node in sorted(self._nodes):
            if node in visited:
                continue
            component: set[str] = set()
            queue = deque([node])
            while queue:
                current = queue.popleft()
                if current in visited:
                    continue
                visited.add(current)
                component.add(current)
                for edge in self._adj.get(current, []):
                    if edge.target not in visited:
                        queue.append(edge.target)
                for edge in self._rev.get(current, []):
                    if edge.source not in visited:
                        queue.append(edge.source)
            if component:
                components.append(component)
        return components

    def summary(self) -> str:
        return (
            f"KernelGraph: {self.node_count} nodes, {self.edge_count} edges, "
            f"{len(self.connected_components())} components, cycles={'yes' if self.has_cycles() else 'no'}"
        )

    def _link_context_package(self, index: KernelIndex, context_package: ContextPackage) -> None:
        source = self._node_for_record(context_package)
        target = self.node_id("work_unit", context_package.work_unit_id)
        if index.exists("work_unit", context_package.work_unit_id):
            self._add_edge(source, target, GraphEdgeType.CONTEXT_FOR)

    def _link_work_unit(self, index: KernelIndex, work_unit: WorkUnit) -> None:
        work_node = self._node_for_record(work_unit)
        if work_unit.parent_work_unit_id and index.exists("work_unit", work_unit.parent_work_unit_id):
            self._add_edge(
                self.node_id("work_unit", work_unit.parent_work_unit_id),
                work_node,
                GraphEdgeType.SPAWNS_CHILD,
            )
        for dependency in work_unit.dependencies:
            if index.exists("work_unit", dependency):
                self._add_edge(
                    self.node_id("work_unit", dependency),
                    work_node,
                    GraphEdgeType.ENABLES_WORK,
                )

    def _link_commit_delta(self, index: KernelIndex, commit_delta: CommitDelta) -> None:
        delta_node = self._node_for_record(commit_delta)
        work_node = self.node_id("work_unit", commit_delta.work_unit_id)
        if index.exists("work_unit", commit_delta.work_unit_id):
            self._add_edge(work_node, delta_node, GraphEdgeType.EMITS_DELTA)
        for context_package in index.context_packages_for_work_unit(commit_delta.work_unit_id):
            if context_package.context_version == commit_delta.context_version:
                self._add_edge(
                    self._node_for_record(context_package),
                    delta_node,
                    GraphEdgeType.CONTEXT_FOR_DELTA,
                )

    def _link_question_answer(self, index: KernelIndex, answer: QuestionAnswerRecord) -> None:
        answer_node = self._node_for_record(answer)
        if index.exists("work_unit", answer.work_unit_id):
            self._add_edge(
                self.node_id("work_unit", answer.work_unit_id),
                answer_node,
                GraphEdgeType.ANSWER_FOR_WORK,
            )
        if index.exists("open_question", answer.question_id):
            self._add_edge(
                answer_node,
                self.node_id("open_question", answer.question_id),
                GraphEdgeType.ANSWERS_QUESTION,
            )

    def _link_reviewer_answer_queue(self, index: KernelIndex, projection: ReviewerAnswerQueueProjectionRecord) -> None:
        queue_node = self._node_for_record(projection)
        for question_id in projection.pending_question_ids:
            if index.exists("open_question", question_id):
                self._add_edge(
                    queue_node,
                    self.node_id("open_question", question_id),
                    GraphEdgeType.QUEUES_PENDING_QUESTION,
                )
        for answer_id in projection.recent_answer_ids:
            if index.exists("question_answer", answer_id):
                self._add_edge(
                    queue_node,
                    self.node_id("question_answer", answer_id),
                    GraphEdgeType.PROJECTS_ANSWER_RECORD,
                )

    def _link_reviewer_queue_refresh(self, index: KernelIndex, receipt: ReviewerQueueRefreshReceipt) -> None:
        receipt_node = self._node_for_record(receipt)
        for projection_id in receipt.refreshed_projection_ids:
            if index.exists("reviewer_answer_queue", projection_id):
                self._add_edge(
                    receipt_node,
                    self.node_id("reviewer_answer_queue", projection_id),
                    GraphEdgeType.REFRESHES_QUEUE_PROJECTION,
                )

    def _link_planner_manifest(self, index: KernelIndex, manifest: PlannerManifest) -> None:
        manifest_node = self._node_for_record(manifest)
        if index.exists("open_question", manifest.source_question_id):
            self._add_edge(
                self.node_id("open_question", manifest.source_question_id),
                manifest_node,
                GraphEdgeType.QUESTION_FOR_MANIFEST,
            )
        if index.exists("commit_delta", manifest.planner_delta_id):
            self._add_edge(
                self.node_id("commit_delta", manifest.planner_delta_id),
                manifest_node,
                GraphEdgeType.DELTA_FOR_MANIFEST,
            )

    def _link_planner_manifest_sweep(self, index: KernelIndex, sweep: PlannerManifestSweepReceipt) -> None:
        sweep_node = self._node_for_record(sweep)
        for manifest_id in sweep.maintained_manifest_ids:
            if index.exists("planner_manifest", manifest_id):
                self._add_edge(
                    sweep_node,
                    self.node_id("planner_manifest", manifest_id),
                    GraphEdgeType.SWEEPS_MANIFEST,
                )

    def _link_planner_manifest_sweep_aggregate(self, index: KernelIndex, aggregate: PlannerManifestSweepAggregateRecord) -> None:
        aggregate_node = self._node_for_record(aggregate)
        for receipt_id in aggregate.retained_receipt_ids:
            if index.exists("planner_manifest_sweep", receipt_id):
                self._add_edge(
                    aggregate_node,
                    self.node_id("planner_manifest_sweep", receipt_id),
                    GraphEdgeType.AGGREGATES_SWEEP_RECEIPT,
                )

    def _link_manifest_route_state(self, index: KernelIndex, manifest_state: ManifestRouteStateRecord) -> None:
        manifest_node = self._node_for_record(manifest_state)
        if (
            manifest_state.owner_scope.scope_type == "WORK_UNIT"
            and index.exists("work_unit", manifest_state.owner_scope.scope_id)
        ):
            self._add_edge(
                self.node_id("work_unit", manifest_state.owner_scope.scope_id),
                manifest_node,
                GraphEdgeType.MANIFEST_FOR_WORK,
            )
        linked_id = manifest_state.linked_automation_state_id
        if linked_id and index.exists("automation_state", linked_id):
            self._add_edge(
                manifest_node,
                self.node_id("automation_state", linked_id),
                GraphEdgeType.MANIFEST_BINDS_AUTOMATION,
            )

    def _link_automation_state(self, index: KernelIndex, automation_state: AutomationStateRecord) -> None:
        automation_node = self._node_for_record(automation_state)
        if automation_state.scope_type == "WORK_UNIT" and index.exists("work_unit", automation_state.scope_ref):
            self._add_edge(
                self.node_id("work_unit", automation_state.scope_ref),
                automation_node,
                GraphEdgeType.AUTOMATION_FOR_WORK,
            )
        if automation_state.linked_manifest_id and index.exists("manifest_route_state", automation_state.linked_manifest_id):
            self._add_edge(
                self.node_id("manifest_route_state", automation_state.linked_manifest_id),
                automation_node,
                GraphEdgeType.MANIFEST_BINDS_AUTOMATION,
            )

    def _link_open_question(self, index: KernelIndex, open_question: OpenQuestion) -> None:
        question_node = self._node_for_record(open_question)
        work_node = self.node_id("work_unit", open_question.origin_work_unit)
        if index.exists("work_unit", open_question.origin_work_unit):
            self._add_edge(work_node, question_node, GraphEdgeType.RAISES_QUESTION)
        if open_question.parent_question_id and index.exists("open_question", open_question.parent_question_id):
            self._add_edge(
                self.node_id("open_question", open_question.parent_question_id),
                question_node,
                GraphEdgeType.PARENT_QUESTION_FOR,
            )
        for blocked_work_unit in open_question.blocking:
            if index.exists("work_unit", blocked_work_unit):
                self._add_edge(
                    question_node,
                    self.node_id("work_unit", blocked_work_unit),
                    GraphEdgeType.BLOCKS_WORK,
                )

    def _add_edge(self, source: str, target: str, edge_type: GraphEdgeType) -> None:
        edge = GraphEdge(source=source, target=target, edge_type=edge_type)
        self._nodes.add(source)
        self._nodes.add(target)
        if edge not in self._adj[source]:
            self._adj[source].append(edge)
            self._rev[target].append(edge)

    def _node_for_record(self, record: object) -> str:
        if isinstance(record, WorkUnit):
            return self.node_id("work_unit", record.work_unit_id)
        if isinstance(record, ContextPackage):
            return self.node_id("context_package", record.context_package_id)
        if isinstance(record, CommitDelta):
            return self.node_id("commit_delta", record.delta_id)
        if isinstance(record, OpenQuestion):
            return self.node_id("open_question", record.question_id)
        if isinstance(record, QuestionAnswerRecord):
            return self.node_id("question_answer", record.answer_id)
        if isinstance(record, ReviewerAnswerQueueProjectionRecord):
            return self.node_id("reviewer_answer_queue", record.projection_id)
        if isinstance(record, ReviewerQueueRefreshReceipt):
            return self.node_id("reviewer_queue_refresh", record.receipt_id)
        if isinstance(record, PlannerManifest):
            return self.node_id("planner_manifest", record.manifest_id)
        if isinstance(record, PlannerManifestSweepReceipt):
            return self.node_id("planner_manifest_sweep", record.receipt_id)
        if isinstance(record, PlannerManifestSweepAggregateRecord):
            return self.node_id("planner_manifest_sweep_aggregate", record.aggregate_id)
        if isinstance(record, ManifestRouteStateRecord):
            return self.node_id("manifest_route_state", record.manifest_id)
        if isinstance(record, AutomationStateRecord):
            return self.node_id("automation_state", record.automation_state_id)
        raise TypeError(f"Unsupported kernel record: {type(record).__name__}")


IonGraph = KernelGraph
