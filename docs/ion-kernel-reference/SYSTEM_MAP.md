---
type: system_map
authority: A2_EXECUTOR
created: 2026-04-08T19:00:00-04:00
status: ACTIVE
---

# ION System Map

This map explains the current kernel by **role in the canonical workflow**.

## 0. Cross-cutting law

- **Execution symmetry**: manual and automated carriers must implement the same workflow steps.
- **Horizon orchestration**: the system must maintain immediate, near, and far work windows that tighten as execution approaches.
- **Manual fallback**: when an automation carrier is unavailable, the current executor carries the same step manually using the same packet and landing law.

## 1. Core workflow machinery

These modules define the lawful sequence itself.

| Family | Main modules | Role in the loop |
|---|---|---|
| kernel truth | `model.py`, `store.py`, `index.py`, `graph.py` | persist and query lawful state |
| continuity packets | `packet_validation.py`, `takeover.py`, `equivalence.py`, `continuation.py`, `horizon_state.py`, `sequential_kernel.py` | validate canonical packets, assess takeover sufficiency, prove bounded manual/automation symmetry, materialize context-perfect continuation bundles, render bounded continuation scaffolds, and keep handoff state legible |
| bounded context | `context_compiler.py`, `capsule_manager.py`, `manifest_state.py` | compile the bounded packet / context surfaces |
| work gating | `scheduler.py`, `executor_registry.py`, `dispatch.py`, `execution.py`, `validation.py`, `commit.py`, `threshold.py`, `governed_write.py` | choose, bind, dispatch, validate, and land one bounded step |
| review / questions | `questions.py`, `question_answers.py`, `reviews.py`, `signal_followups.py` | preserve uncertainty and route blocking pressure |
| child work | `children.py`, `planner_gate.py`, `child_work_service.py` | hand one bounded task to another executor |
| recovery | `recovery_replay.py` | re-enter the same loop after interruption |
| external carrier | `external_execution_bridge.py` | hand the same bounded step to an external/API worker |

## 2. Automation carriers

These modules let the kernel carry more of the same loop explicitly.

| Family | Main modules | Role |
|---|---|---|
| automation policy | `automation_policy.py` | decide whether a next action is lawful now |
| operator control | `operator_control.py` | stop / hold / drain / resume scopes and runtime |
| daemon runtime | `daemon.py`, `daemon_actions.py`, `daemon_loop.py`, `daemon_service.py` | supervised runtime carrier for the next lawful step |
| bootstrap init / bridge / activation | `bootstrap_init.py`, `bootstrap_bridge.py`, `bootstrap_activation.py` | mint visible inbox/bootstrap task packets, turn them into canonical daemon pressure, and orchestrate the explicit supervised activation ceremony without widening daemon law |
| runtime hardening | `operational_hardening.py` | package the supervised runtime truthfully for operation |

## 3. Sequential/manual carrier support

| Family | Main modules | Role |
|---|---|---|
| sequential kernel routing | `sequential_kernel.py` | generate role sessions and handoffs for the same workflow under low-burn sequential operation |

## 4. Support / witness surfaces

These surfaces are useful, but they are subordinate to the workflow and kernel truth.

| Family | Main modules | Role |
|---|---|---|
| runtime reports | `runtime_reporting.py`, `runtime_report_*` | witness, browse, compare, and summarize workflow activity |
| service ledgers / receipts | generated under `ION/05_context/history/` | durable witness of bounded service actions |

## 5. Current project reading

The recent J-through-L stack is best understood this way:

- J1–J5 are **workflow automation carriers**, not a second workflow.
- the larger `runtime_report_*` family is **support / witness**, not the center of authority.
- K1–K7 plus L0–L4 are **proof and continuity normalization**, not a second planner.
- M0 is now the canonical **settlement-law definition** for later bounded parallel execution.
- M1-M17 are now embodied in kernel/operator surfaces with dedicated scenario-proof hardening where required.
- Phase 1 template governance and bridge-packet status clarification are current-phase governance surfaces beside the canonical packet floor, not replacements for it.
- current-generation completion is ratified; any further gap should be treated as a new bounded workload rather than as a missing core center.

## 6. Entry and packaging posture

- `ION/04_packages/kernel/operator_cli.py` = unified operator-facing CLI over the live supervised runtime carriers
- `ION/04_packages/kernel/__main__.py` = package entrypoint into the operator CLI
- `pyproject.toml` = branch-root packaging metadata so editable install, `import kernel`, `python -m kernel`, and `pytest` work without manual `PYTHONPATH`
- `ION/tests/test_packaging_entry_posture.py` = packaging proof surface

## 7. Orientation aids

For current-branch center and lawful next-work preparation, use:

- `ION/REPO_AUTHORITY.md`
- `ION/06_intelligence/orchestration/2026-04-12_current_branch_active_center_map.md`
- `ION/06_intelligence/orchestration/2026-04-12_governed_template_context_feed_map.md`
- `ION/06_intelligence/orchestration/2026-04-12_post_ratification_execution_preparation_and_startup_map.md`
- `ION/06_intelligence/orchestration/2026-04-13_startup_template_feed_and_task_routing_defaults.md`
- `ION/05_context/inbox/README.md`

These do not replace this system map. They identify the active repo authority surface, active center, active template feed floor, and current restart posture inside the wider organism.


## Current support-field setup note

The current branch now includes a branch-embedded Composer 2 operator runbook for `Vestige`, `Thoth`, and `Mason` at:
- `ION/06_intelligence/orchestration/2026-04-12_composer2_support_field_setup_and_operator_runbook.md`
- `ION/06_intelligence/orchestration/2026-04-13_startup_template_feed_and_task_routing_defaults.md`
- `ION/05_context/inbox/README.md`

Current truthful posture:
- `Vestige` and `Thoth` are ready to use on Composer 2 now under the active support-field law
- `Mason` is configured but remains held until a new bounded implementation packet exists

- broader role boots (Relay, Vice, Nemesis, Atlas, Vizier-adjacent surfaces) remain lawful but are **not** part of the default startup field unless a bounded packet explicitly activates them
- browser ChatGPT remains external / unmounted by default


The current staffing / semantic identity evidence lane is now consolidated in:
- `ION/06_intelligence/orchestration/2026-04-13_staffing_and_semantic_identity_steward_consolidation_proposal.md`
- `ION/06_intelligence/orchestration/2026-04-13_steward_third_pass_template_and_example_alignment.md`


## Current orchestration-management surfaces

- `ION/06_intelligence/orchestration/2026-04-12_current_phase_orchestration_management_map.md`
- `ION/03_registry/domains/domain.current_phase_orchestration_management.domain.yaml`
- `ION/03_registry/boots/STEWARD.boot.md`
- `ION/03_registry/semantic_identities/STEWARD.semantic.yaml`
- `ION/02_architecture/STEWARD_CURRENT_PHASE_ORCHESTRATION_PROTOCOL.md`
- `ION/07_templates/bindings/STEWARD__TASK.md`
- `ION/07_templates/bindings/STEWARD__STATUS_REPORT.md`
- `ION/07_templates/bindings/STEWARD__PROPOSAL.md`
- `ION/07_templates/bindings/STEWARD__TEMPLATE_SURFACE_CHANGE.md`


## Current-phase orchestration truth correction

The current-phase orchestration truename is **Steward**. `Codex` remains the common IDE-native carrier / chassis alias in Cursor. Current orchestration-management and template-governance surfaces therefore include:

- `ION/03_registry/boots/STEWARD.boot.md`
- `ION/03_registry/semantic_identities/STEWARD.semantic.yaml`
- `ION/07_templates/bindings/STEWARD__TASK.md`
- `ION/07_templates/bindings/STEWARD__STATUS_REPORT.md`
- `ION/07_templates/bindings/STEWARD__PROPOSAL.md`
- `ION/07_templates/bindings/STEWARD__TEMPLATE_SURFACE_CHANGE.md`
- `ION/02_architecture/STEWARD_CURRENT_PHASE_ORCHESTRATION_PROTOCOL.md`
- `ION/02_architecture/TEMPLATE_SURFACE_EVOLUTION_PROTOCOL.md`
- `ION/07_templates/actions/TEMPLATE_SURFACE_CHANGE.md`

Supporting carrier compatibility surfaces remain:

- `ION/03_registry/boots/CODEX.boot.md`
- `ION/02_architecture/CODEX_LEAD_ORCHESTRATION_PROTOCOL.md`
- `ION/07_templates/bindings/CODEX__TASK.md`
- `ION/07_templates/bindings/CODEX__STATUS_REPORT.md`
- `ION/07_templates/bindings/CODEX__PROPOSAL.md`


- `ION/06_intelligence/orchestration/2026-04-13_steward_fifth_pass_role_and_binding_alignment.md`

- `ION/06_intelligence/orchestration/2026-04-13_steward_sixth_pass_role_field_and_path_normalization.md`


## 2026-04-13 master recovery surfaces

- `ION/06_intelligence/orchestration/2026-04-13_master_recovery_record.md`
- `ION/06_intelligence/orchestration/2026-04-13_fractured_core_recovery_map.md`
- `ION/06_intelligence/orchestration/2026-04-13_prior_audits_failure_record.md`
- `ION/06_intelligence/orchestration/2026-04-13_recovery_program.md`


## Corpus recovery program

A project-wide corpus recovery program now lives at:
`ION/06_intelligence/orchestration/corpus_recovery/`

Startup recovery surfaces:
- `00_program/recovery_program_status.md`
- `00_program/recovery_program_rules.md`
- `01_archive_register/master_archive_register.md`
- `02_prior_audits/prior_audit_register.md`
- `06_values_and_soul_recovery/smallest_values_constitution.md`
- `12_status_and_conflicts/conflict_register.md`

This program exists to recover the full project estate rather than pretending the current branch alone explains the total organism.


## Corpus recovery pass 1 enriched surfaces
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/recovery_program_status.md`
- `ION/06_intelligence/orchestration/corpus_recovery/01_archive_register/root_family_index.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/current_branch_template_law_kernel_line.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/ion_build_runtime_api_session_line.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/victus_gemini_manager_orchestrator_swarm_line.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/old_aether_law_atlas_template_development_line.md`
- `ION/06_intelligence/orchestration/corpus_recovery/12_status_and_conflicts/conflict_register.md`


- `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass3_enrichment_note.md`

- `ION/06_intelligence/orchestration/corpus_recovery/05_template_protocol_atlas/meta_template_comparison_matrix.md`


## Corpus recovery pass 4
- `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass4_enrichment_note.md`



## Corpus recovery pass 5
- `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass5_enrichment_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/conjugate_basis_hidden_field_profile.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/composeraudit_wrapper_profile.md`
- `ION/06_intelligence/orchestration/corpus_recovery/03_system_profiles/geminiaudit_wrapper_profile.md`
- `ION/06_intelligence/orchestration/corpus_recovery/10_runnable_proofs/runnable_verification_receipts/2026-04-13_ionv2_pytest_receipt.md`
- `ION/06_intelligence/orchestration/corpus_recovery/10_runnable_proofs/runnable_verification_receipts/2026-04-13_conjugate_basis_hidden_field_pytest_receipt.md`


- Latest corpus recovery note: `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass6_enrichment_note.md`


- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass7_enrichment_note.md`


## Corpus recovery pass 8 enriched surfaces
- `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass8_enrichment_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/10_runnable_proofs/runnable_verification_receipts/2026-04-13_aether_os_v4_runtime_swarm_receipt.md`
- `ION/06_intelligence/orchestration/corpus_recovery/05_template_protocol_atlas/historical_meta_template_vs_current_branch_delta_judgment.md`
- `ION/06_intelligence/orchestration/corpus_recovery/06_values_and_soul_recovery/conjugate_basis_hidden_field_ontology_judgment.md`


- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass9_enrichment_note.md` — Pass 9 recovery strengthening note

- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass10_enrichment_note.md`


- `2026-04-13_corpus_recovery_pass11_enrichment_note.md`

- Pass 12: see `06_intelligence/orchestration/corpus_recovery/00_program/milestone1_trust_judgment.md`, `01_archive_register/production_estate_child_root_status_matrix.csv`, and `09_lineage_and_supersession/center_status_judgment.md`.

## Pass 13 atlas-base stabilization

- `06_intelligence/orchestration/corpus_recovery/11_grand_picture/atlas_base_index.md`
- `06_intelligence/orchestration/corpus_recovery/11_grand_picture/atlas_base_read_order.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/milestone1_completion_judgment.md`


## Pass 14 working atlas base surfaces
- `11_grand_picture/working_atlas_base.md`
- `11_grand_picture/working_center_selection_guide.md`
- `00_program/milestone1_freeze_manifest.csv`


## Pass 15 atlas operating-layer entry
Use the atlas control layer before starting future work:
- `06_intelligence/orchestration/corpus_recovery/11_grand_picture/atlas_control_surface.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/atlas_work_gating_protocol.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/future_work_gating_authority_matrix.csv`

### Atlas packet-gate layer
The recovery atlas now includes a packet-control layer that sits above future work start-up: packet requirements, anti-reinvention law, a gated work-start record template, and a checklist.


## Pass 17 atlas work-start layer
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/work_posture_selection_guide.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/non_widening_work_classes.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/gated_work_start_examples/README.md`


## Pass 18 atlas control addition
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/canonical_future_work_question_classes.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/canonical_future_work_question_class_defaults.csv
- `06_intelligence/orchestration/corpus_recovery/00_program/canonical_future_work_answer_output_classes.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/canonical_future_work_answer_output_defaults.csv``


## Pass 20 landing and horizon control
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/canonical_landing_boundary_classes.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/orchestration_horizon_and_completion_requirements.md`
- `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/atlas_control_surface.md`


## Pass 21 control-card compression
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/atlas_control_card.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/future_work_control_defaults_matrix.csv`


## Pass 22 lifecycle demonstration layer
- `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_pass22_lifecycle_demonstration_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/atlas_control_lifecycle_demonstration.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/control_lifecycle_examples/README.md`


## Pass 23 stable operating-layer surfaces
- `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/default_operating_kernel.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/stable_operating_layer_judgment.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/operating_layer_stability_matrix.csv`


## Pass 24 default project control kernel
- `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/default_project_control_kernel.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/default_project_control_kernel_judgment.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_manifest.csv`


Pass 25 control additions: `project_control_kernel_escalation_judgment.md`, `project_control_kernel_escalation_matrix.csv`, `project_control_kernel_lifecycle.md`.


Pass 26 adds the return/reassessment companion layer for widened work in the corpus recovery operating kernel. See `ION/06_intelligence/orchestration/2026-04-13_corpus_recovery_program_index.md`.


## Pass 27 frozen control-kernel surfaces
- `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/default_project_control_kernel.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_state_card.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_freeze_judgment.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_freeze_manifest.csv`


## Pass 28 frozen-kernel revision surfaces
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_revision_and_thaw_protocol.md`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_change_classes.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_revision_record_template.md`
- `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/frozen_kernel_change_path.md`

## Pass 29 kernel revision approval/lifecycle surfaces
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass29_kernel_revision_lifecycle_note.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_revision_approval_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_revision_lifecycle.md`

- Kernel governance cadence: `ION/06_intelligence/orchestration/corpus_recovery/11_grand_picture/project_control_kernel_governance_card.md`


Pass 31 governance outcomes:
- `06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_governance_outcome_classes.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_governance_outcome_defaults.csv`
- `06_intelligence/orchestration/corpus_recovery/00_program/project_control_kernel_review_examples/README.md`


## Pass 32 synthesis / Era 2 transition
- `06_intelligence/orchestration/2026-04-13_consolidation_state_remaining_work_and_evolution_path.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/era2_controlled_reintegration_transition_judgment.md`
- `06_intelligence/orchestration/corpus_recovery/00_program/era2_reintegration_lane_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/11_grand_picture/era2_controlled_reintegration.md`

## Pass 33 Lane A controlled reintegration packet
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass33_lane_a_meta_template_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/README.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_a_meta_template_restoration_delta_packet.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_a_meta_template_restoration_delta_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_a_meta_template_restoration_transition_candidates.md`

## Pass 34 Lane B controlled reintegration packet
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass34_lane_b_activation_authority_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_b_activation_authority_delta_packet.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_b_activation_authority_delta_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_b_activation_authority_transition_candidates.md`

## Pass 35 Lane C controlled reintegration packet
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass35_lane_c_runtime_session_api_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_c_runtime_session_api_delta_packet.md`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_c_runtime_session_api_delta_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/13_controlled_reintegration/lane_c_runtime_session_api_transition_candidates.md`


## Pass 36 runtime/session proposal-space design packet
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass36_runtime_surface_design_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/README.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_c_runtime_session_surface_design_packet.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_c_runtime_session_surface_design_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_c_runtime_session_surface_design_outlines.md`


## Pass 37 activation proposal-space design packet
- `06_intelligence/orchestration/2026-04-13_corpus_recovery_pass37_activation_surface_design_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_b_activation_surface_design_packet.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_b_activation_surface_design_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_b_activation_surface_design_outlines.md`


## Pass 38 meta-template proposal-space design packet
- `06_intelligence/orchestration/2026-04-14_corpus_recovery_pass38_meta_template_surface_design_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_a_meta_template_surface_design_packet.md`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_a_meta_template_surface_design_matrix.csv`
- `06_intelligence/orchestration/corpus_recovery/14_surface_design/lane_a_meta_template_surface_design_outlines.md`


## Era 2 review layer

- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/activation_authority_protocol_review_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/drafts/ACTIVATION_AUTHORITY_PROTOCOL.review_draft.md`

## Pass 40 review surfaces
- `06_intelligence/orchestration/2026-04-14_corpus_recovery_pass40_executor_lifecycle_review_draft_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/executor_lifecycle_protocol_review_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/executor_lifecycle_protocol_review_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/drafts/EXECUTOR_LIFECYCLE_PROTOCOL.review_draft.md`



## Quarantined active-law seam review
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/activation_lifecycle_interface_review_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/activation_lifecycle_interface_review_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/15_quarantined_active_law_review/drafts/ACTIVATION_LIFECYCLE_INTERFACE.review_note.md`

## Promotion-candidate review surfaces
- `ION/06_intelligence/orchestration/corpus_recovery/16_promotion_candidate_review/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/16_promotion_candidate_review/activation_lifecycle_joint_promotion_candidate_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/16_promotion_candidate_review/activation_lifecycle_joint_promotion_candidate_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/16_promotion_candidate_review/activation_lifecycle_joint_thaw_readiness_criteria.md`


## Pass 43 counterexample-review surfaces
- `ION/06_intelligence/orchestration/2026-04-14_corpus_recovery_pass43_activation_lifecycle_counterexample_review_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/17_counterexample_review/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/17_counterexample_review/activation_lifecycle_overlap_counterexample_review_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/17_counterexample_review/activation_lifecycle_overlap_counterexample_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/17_counterexample_review/activation_lifecycle_overlap_counterexample_findings.md`


## Worked-examples layer
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_carrier_crossing_worked_examples_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_carrier_crossing_worked_examples_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_carrier_crossing_worked_examples.md`


## Pass 45 receipt/settlement worked-example surfaces
- `ION/06_intelligence/orchestration/2026-04-14_corpus_recovery_pass45_activation_lifecycle_receipt_settlement_examples_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_receipt_settlement_worked_examples_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_receipt_settlement_worked_examples_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/18_worked_examples/activation_lifecycle_receipt_settlement_worked_examples.md`


## Pass 46 install-path mapping surfaces
- `ION/06_intelligence/orchestration/2026-04-14_corpus_recovery_pass46_activation_lifecycle_install_path_mapping_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/19_install_path_mapping/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/19_install_path_mapping/activation_lifecycle_install_path_mapping_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/19_install_path_mapping/activation_lifecycle_install_path_mapping_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/19_install_path_mapping/activation_lifecycle_install_path_mapping.md`


## Pass 47 thaw-readiness reassessment surfaces

- `ION/06_intelligence/orchestration/corpus_recovery/20_thaw_readiness_reassessment/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/20_thaw_readiness_reassessment/activation_lifecycle_joint_thaw_readiness_reassessment_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/20_thaw_readiness_reassessment/activation_lifecycle_joint_thaw_readiness_reassessment_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/20_thaw_readiness_reassessment/activation_lifecycle_joint_thaw_readiness_reassessment.md`

## Pass 48 bounded thaw packet surfaces
- `06_intelligence/orchestration/2026-04-14_corpus_recovery_pass48_activation_lifecycle_bounded_thaw_packet_note.md`
- `06_intelligence/orchestration/corpus_recovery/21_bounded_thaw_packet/README.md`
- `06_intelligence/orchestration/corpus_recovery/21_bounded_thaw_packet/activation_lifecycle_joint_bounded_thaw_packet.md`
- `06_intelligence/orchestration/corpus_recovery/21_bounded_thaw_packet/activation_lifecycle_joint_bounded_thaw_touch_set.csv`
- `06_intelligence/orchestration/corpus_recovery/21_bounded_thaw_packet/activation_lifecycle_joint_bounded_thaw_adjacent_edits.md`
- `06_intelligence/orchestration/corpus_recovery/21_bounded_thaw_packet/activation_lifecycle_joint_review_only_remainder.md`

## Pass 49 thaw-closure review surfaces
- `ION/06_intelligence/orchestration/2026-04-14_corpus_recovery_pass49_activation_lifecycle_thaw_closure_review_note.md`
- `ION/06_intelligence/orchestration/corpus_recovery/22_thaw_closure_review/README.md`
- `ION/06_intelligence/orchestration/corpus_recovery/22_thaw_closure_review/activation_lifecycle_joint_thaw_closure_review_packet.md`
- `ION/06_intelligence/orchestration/corpus_recovery/22_thaw_closure_review/activation_lifecycle_joint_thaw_closure_review_matrix.csv`
- `ION/06_intelligence/orchestration/corpus_recovery/22_thaw_closure_review/activation_lifecycle_joint_thaw_closure_review.md`
- `ION/06_intelligence/orchestration/corpus_recovery/22_thaw_closure_review/activation_lifecycle_joint_thaw_closure_judgment.md`

