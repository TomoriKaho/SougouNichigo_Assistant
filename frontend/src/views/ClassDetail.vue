<template>
  <section class="card class-detail-page">
    <div class="class-detail-header">
      <div>
        <h2>{{ classDetailTitle }}</h2>
      </div>
      <div class="class-detail-header-actions">
        <div v-if="detail && activeDetailView === 'materials'" class="class-detail-header-search-tools">
          <input v-model.trim="materialsKeyword" placeholder="搜索标题/文件名" @keydown.enter.prevent="refreshMaterials" />
          <button class="ghost" @click="toggleMaterialsOrder" :disabled="loadingMaterials">
            {{ materialsOrder === 'asc' ? '最新优先' : '最早优先' }}
          </button>
          <button class="ghost" @click="refreshMaterials" :disabled="loadingMaterials">刷新</button>
        </div>
        <div v-if="detail && activeDetailView === 'assignments' && !isTeacherAssignmentDetailView" class="class-detail-header-search-tools">
          <input v-model.trim="assignmentsKeyword" placeholder="搜索作业名/内容" @keydown.enter.prevent="refreshAssignments" />
          <button class="ghost" @click="toggleAssignmentsOrder" :disabled="loadingAssignments">
            {{ assignmentsOrder === 'asc' ? '最新优先' : '最早优先' }}
          </button>
          <button class="ghost" @click="refreshAssignments" :disabled="loadingAssignments">刷新</button>
        </div>
        <div v-if="canConfigureStudentUploads" class="class-student-upload-switch">
          <span>允许学生上传资料</span>
          <label class="switch" aria-label="是否允许学生上传课程资料">
            <input
              type="checkbox"
              :checked="!!detail?.allow_student_uploads"
              :disabled="savingAction"
              @change="toggleStudentUploadPermission"
            />
            <span class="slider"></span>
          </label>
        </div>
        <button
          v-if="canDissolveClass"
          class="danger"
          type="button"
          @click="confirmDissolveClass"
        >
          解散班级
        </button>
        <button class="ghost" type="button" @click="goBack">返回班级列表</button>
      </div>
    </div>

    <div class="class-detail-content">
      <div v-if="error" class="error-block">
        <p class="error">{{ error }}</p>
        <button class="ghost" @click="reloadAll">重试</button>
      </div>
      <div v-else-if="loadingDetail" class="loading">加载中...</div>
      <template v-else-if="detail">
        <div class="class-detail-panel-shell">
          <div class="class-detail-switch-row">
            <div class="class-detail-tabbar" role="tablist" aria-label="班级详情内容切换">
              <button
                v-for="option in detailViewOptions"
                :key="option.key"
                type="button"
                class="class-detail-tab"
                :class="{ active: activeDetailView === option.key }"
                :aria-selected="activeDetailView === option.key"
                @click="activeDetailView = option.key"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="class-detail-panel-meta">
              <button
                v-if="activeDetailView === 'materials' && canUploadMaterials"
                type="button"
                @click="openUploadDialog"
              >
                上传资料
              </button>
              <template v-if="activeDetailView === 'assignments' && canManageAssignments">
                <template v-if="isTeacherAssignmentDetailView">
                  <button class="assignment-return-button" type="button" @click="returnToAssignmentsList">
                    返回作业列表
                  </button>
                  <button class="ghost" type="button" :disabled="loadingAssignmentDetail" @click="loadAssignmentDetail(assignmentDetail.id)">
                    刷新
                  </button>
                </template>
                <button
                  v-else
                  type="button"
                  @click="openAssignmentDialog()"
                >
                  布置作业
                </button>
              </template>
              <span v-if="activeDetailView === 'members'" class="muted class-detail-total-text">共 {{ membersTotal }} 人</span>
              <span v-else-if="activeDetailView === 'assignments' && !isTeacherAssignmentDetailView" class="muted class-detail-total-text">共 {{ assignmentsTotal }} 个作业</span>
              <span v-else-if="activeDetailView === 'materials'" class="muted class-detail-total-text">共 {{ materialsTotal }} 个文件</span>

              <div
                v-if="activeDetailView === 'members'"
                class="pagination management-inline-pagination class-detail-inline-pagination"
              >
                <button class="ghost" :disabled="membersPage === 1" @click="changeMembersPage(membersPage - 1)">上一页</button>
                <label class="management-pagination-jump" for="class-members-page-jump">
                  第
                  <input
                    id="class-members-page-jump"
                    v-model.number="membersPageJump"
                    class="management-page-number-input"
                    type="number"
                    min="1"
                    :max="membersTotalPages"
                    :disabled="membersTotalPages <= 1"
                    @keydown.enter.prevent="jumpToMembersPage"
                    @blur="jumpToMembersPage"
                  />
                  / {{ membersTotalPages }} 页
                </label>
                <button class="ghost" :disabled="membersPage === membersTotalPages" @click="changeMembersPage(membersPage + 1)">下一页</button>
              </div>

              <div
                v-else-if="activeDetailView === 'materials'"
                class="pagination management-inline-pagination class-detail-inline-pagination"
              >
                <button class="ghost" :disabled="materialsPage === 1 || loadingMaterials" @click="changeMaterialsPage(materialsPage - 1)">上一页</button>
                <label class="management-pagination-jump" for="class-materials-page-jump">
                  第
                  <input
                    id="class-materials-page-jump"
                    v-model.number="materialsPageJump"
                    class="management-page-number-input"
                    type="number"
                    min="1"
                    :max="materialsTotalPages"
                    :disabled="materialsTotalPages <= 1 || loadingMaterials"
                    @keydown.enter.prevent="jumpToMaterialsPage"
                    @blur="jumpToMaterialsPage"
                  />
                  / {{ materialsTotalPages }} 页
                </label>
                <button class="ghost" :disabled="materialsPage === materialsTotalPages || loadingMaterials" @click="changeMaterialsPage(materialsPage + 1)">下一页</button>
              </div>

              <div
                v-else-if="activeDetailView === 'assignments' && !isTeacherAssignmentDetailView"
                class="pagination management-inline-pagination class-detail-inline-pagination"
              >
                <button class="ghost" :disabled="assignmentsPage === 1 || loadingAssignments" @click="changeAssignmentsPage(assignmentsPage - 1)">上一页</button>
                <label class="management-pagination-jump" for="class-assignments-page-jump">
                  第
                  <input
                    id="class-assignments-page-jump"
                    v-model.number="assignmentsPageJump"
                    class="management-page-number-input"
                    type="number"
                    min="1"
                    :max="assignmentsTotalPages"
                    :disabled="assignmentsTotalPages <= 1 || loadingAssignments"
                    @keydown.enter.prevent="jumpToAssignmentsPage"
                    @blur="jumpToAssignmentsPage"
                  />
                  / {{ assignmentsTotalPages }} 页
                </label>
                <button class="ghost" :disabled="assignmentsPage === assignmentsTotalPages || loadingAssignments" @click="changeAssignmentsPage(assignmentsPage + 1)">下一页</button>
              </div>
            </div>
          </div>

          <section v-show="activeDetailView === 'members'" class="class-detail-panel class-members-section">
            <div class="management-table-scroll class-detail-table-scroll">
              <table class="table class-members-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>身份</th>
                    <th>加入时间</th>
                    <th class="classes-actions-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="member in pagedMembers" :key="member.id">
                    <td>{{ member.username || '-' }}</td>
                    <td>{{ member.email || '-' }}</td>
                    <td>{{ memberRoleLabel(member.member_role) }}</td>
                    <td>{{ formatDateTime(member.joined_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <button
                        v-if="isCreator && member.member_role === 'student'"
                        class="danger"
                        type="button"
                        @click="confirmRemoveMember(member)"
                      >
                        移除学生
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!(detail.members || []).length">
                    <td colspan="5" class="empty">暂无成员</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-show="activeDetailView === 'materials'" class="class-detail-panel class-materials-section">
            <div v-if="materialsError" class="error-block">
              <p class="error">{{ materialsError }}</p>
              <button class="ghost" @click="refreshMaterials">重试</button>
            </div>
            <div v-else-if="loadingMaterials" class="loading">加载中...</div>
            <div v-else class="management-table-scroll class-detail-table-scroll">
              <table class="table reading-materials-table class-reading-materials-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>上传者</th>
                    <th>文件格式</th>
                    <th>大小</th>
                    <th>上传时间</th>
                    <th class="classes-actions-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in materialsRows" :key="item.id">
                    <td>
                      <span class="reading-material-title" :title="item.title">{{ item.title }}</span>
                    </td>
                    <td>{{ item.uploader_username || '-' }}</td>
                    <td>{{ formatMaterialType(item) }}</td>
                    <td>{{ formatFileSize(item.file_size) }}</td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <a
                        v-if="item.can_view && item.view_url"
                        class="ghost table-action-link"
                        :href="item.view_url"
                        target="_blank"
                        rel="noopener"
                      >查看</a>
                      <button v-else class="ghost" disabled title="该文件暂不可在线查看，请下载后打开">查看</button>
                      <button class="ghost" type="button" @click="downloadMaterial(item)">下载</button>
                      <button
                        class="ghost"
                        type="button"
                        :disabled="!item.can_edit"
                        :title="item.can_edit ? '编辑课程资料标题' : '只能编辑自己上传的资料'"
                        @click="openEditDialog(item)"
                      >
                        编辑
                      </button>
                      <button
                        class="danger"
                        type="button"
                        :disabled="!item.can_delete"
                        :title="item.can_delete ? '删除课程资料' : '只能删除自己上传的资料'"
                        @click="confirmDeleteMaterial(item)"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!materialsRows.length">
                    <td colspan="6" class="empty">暂无课程资料</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-show="activeDetailView === 'assignments'" class="class-detail-panel class-assignments-section">
            <div v-if="assignmentsError && !isTeacherAssignmentDetailView" class="error-block">
              <p class="error">{{ assignmentsError }}</p>
              <button class="ghost" @click="refreshAssignments">重试</button>
            </div>
            <div v-else-if="loadingAssignments && !isTeacherAssignmentDetailView" class="loading">加载中...</div>
            <div v-else-if="!isTeacherAssignmentDetailView" class="management-table-scroll class-detail-table-scroll">
              <table class="table class-assignments-table">
                <thead>
                  <tr>
                    <th>作业名</th>
                    <th>发布者</th>
                    <th>公开</th>
                    <th>
                      <button
                        v-if="canManageAssignments"
                        class="table-sort-button"
                        type="button"
                        :disabled="loadingAssignments"
                        @click="toggleAssignmentsSubmissionOrder"
                      >
                        提交/总人数 {{ assignmentsSubmissionOrder === 'asc' ? '↑' : assignmentsSubmissionOrder === 'desc' ? '↓' : '' }}
                      </button>
                      <span v-else>提交/总人数</span>
                    </th>
                    <th>发布时间</th>
                    <th class="classes-actions-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in assignmentsRows" :key="item.id">
                    <td>
                      <span class="reading-material-title" :title="item.title">{{ item.title }}</span>
                    </td>
                    <td>{{ item.creator_username || '-' }}</td>
                    <td>
                      <span class="tag" :class="item.is_public ? 'success' : 'info'">{{ item.is_public ? '公开' : '仅个人' }}</span>
                    </td>
                    <td>
                      <span>{{ item.submission_student_count || 0 }} / {{ classStudentTotal }}</span>
                    </td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <button
                        v-if="canManageAssignments"
                        class="ghost"
                        type="button"
                        @click="openAssignmentDetail(item)"
                      >
                        查看
                      </button>
                      <template v-else>
                        <button class="ghost" type="button" @click="openStudentSubmissionHistory(item)">查看提交历史</button>
                        <button type="button" @click="openSubmissionDialog(item)">提交</button>
                      </template>
                      <button
                        v-if="canManageAssignments"
                        class="ghost"
                        type="button"
                        @click="openAssignmentDialog(item)"
                      >
                        编辑
                      </button>
                      <button
                        v-if="canManageAssignments"
                        class="danger"
                        type="button"
                        @click="confirmDeleteAssignment(item)"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!assignmentsRows.length">
                    <td colspan="6" class="empty">暂无课程作业</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="assignment-teacher-panel">
              <div v-if="assignmentDetail.files?.length" class="assignment-file-list">
                <button
                  v-for="file in assignmentDetail.files"
                  :key="file.id"
                  class="ghost"
                  type="button"
                  @click="downloadAssignmentFile(file)"
                >
                  下载附件：{{ file.original_filename }}
                </button>
              </div>
              <div v-if="assignmentDetailError" class="error-block">
                <p class="error">{{ assignmentDetailError }}</p>
              </div>
              <div v-else-if="loadingAssignmentDetail" class="loading">加载中...</div>
              <div v-else class="management-table-scroll assignment-student-table-scroll">
                <table class="table assignment-student-status-table">
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>邮箱</th>
                      <th>是否提交</th>
                      <th>提交次数</th>
                      <th>首次提交时间</th>
                      <th class="classes-actions-header">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="student in assignmentStudentRows" :key="student.user_id">
                      <td>{{ student.username || '-' }}</td>
                      <td>{{ student.email || '-' }}</td>
                      <td>
                        <span class="tag" :class="student.submitted ? 'success' : 'error'">
                          {{ student.submitted ? '已提交' : '未提交' }}
                        </span>
                      </td>
                      <td>{{ student.submission_count || 0 }}</td>
                      <td>{{ formatDateTime(student.first_submission_at) }}</td>
                      <td class="actions classes-actions-cell">
                        <button
                          class="ghost"
                          type="button"
                          :disabled="!student.submitted"
                          :title="student.submitted ? '查看提交详情' : '该学生尚未提交'"
                          @click="openTeacherSubmissionDialog(student)"
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!assignmentStudentRows.length">
                      <td colspan="6" class="empty">暂无学生用户</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>

    <div v-if="renameDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>修改班级名</h3>
          <button class="ghost" type="button" @click="closeRenameDialog">关闭</button>
        </div>
        <form @submit.prevent="submitRenameClass">
          <label>
            班级名
            <input v-model.trim="renameForm.name" maxlength="64" />
          </label>
          <p class="muted">班级名称不得超过20个字。</p>
          <p v-if="renameError" class="error">{{ renameError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeRenameDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '确认保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="removeMemberDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认移除学生</h3>
          <button class="ghost" type="button" @click="closeRemoveMemberDialog">关闭</button>
        </div>
        <p>即将移除学生：<strong>{{ removeMemberDialog.username }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeRemoveMemberDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitRemoveMember">
            {{ savingAction ? '移除中...' : '确认移除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="dissolveDialogOpen" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认解散班级</h3>
          <button class="ghost" type="button" @click="closeDissolveDialog">关闭</button>
        </div>
        <p>即将解散班级：<strong>{{ detail?.name }}</strong></p>
        <p class="muted">解散后，班级成员和加入记录都会被删除，班级将不可继续访问。此操作不可恢复。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDissolveDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitDissolveClass">
            {{ savingAction ? '解散中...' : '确认解散' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="uploadDialogOpen" class="overlay">
      <div class="modal reading-material-upload-modal">
        <div class="modal-header">
          <h3>上传课程资料</h3>
          <button class="ghost" type="button" @click="closeUploadDialog">关闭</button>
        </div>
        <form @submit.prevent="submitUploadMaterial">
          <label>
            标题
            <input v-model="uploadForm.title" placeholder="不填写时使用文件名" />
          </label>
          <label>
            文件
            <input
              ref="fileInput"
              type="file"
              accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              @change="handleFileChange"
            />
          </label>
          <p class="muted selected-file-line">
            支持 HTML、图片、PDF 和 Word。HTML 不超过 10MB，图片不超过 20MB，PDF/Word 不超过 200MB。
          </p>
          <p v-if="uploadFile" class="muted selected-file-line">
            {{ uploadFile.name }} / {{ formatFileSize(uploadFile.size) }}
          </p>
          <p v-if="uploadError" class="error">{{ uploadError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeUploadDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '上传中...' : '上传' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="editMaterialDialog" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>编辑课程资料</h3>
          <button class="ghost" type="button" @click="closeEditDialog">关闭</button>
        </div>
        <form @submit.prevent="submitEditMaterial">
          <label>
            标题
            <input v-model.trim="editMaterialForm.title" />
          </label>
          <p v-if="editMaterialError" class="error">{{ editMaterialError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeEditDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="deleteMaterialDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认删除课程资料</h3>
          <button class="ghost" type="button" @click="closeDeleteMaterialDialog">关闭</button>
        </div>
        <p>即将删除课程资料：<strong>{{ deleteMaterialDialog.title || deleteMaterialDialog.original_filename }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDeleteMaterialDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitDeleteMaterial">
            {{ savingAction ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="assignmentDialogOpen" class="overlay">
      <div class="modal reading-material-upload-modal assignment-edit-modal">
        <div class="modal-header">
          <h3>{{ assignmentDialogItem ? '编辑课程作业' : '布置课程作业' }}</h3>
          <button class="ghost" type="button" @click="closeAssignmentDialog">关闭</button>
        </div>
        <form @submit.prevent="submitAssignment">
          <label>
            作业名
            <input v-model.trim="assignmentForm.title" maxlength="120" />
          </label>
          <label>
            作业内容
            <textarea v-model.trim="assignmentForm.content" rows="5" placeholder="可选"></textarea>
          </label>
          <div class="class-student-upload-switch assignment-public-switch">
            <span class="assignment-public-label">
              作业公开
              <span class="assignment-help-tooltip" tabindex="0" aria-label="公开时，将允许学生查看其他同学的提交内容">
                <span class="assignment-help-icon">?</span>
                <span class="assignment-help-tooltip-bubble" role="tooltip">公开时，将允许学生查看其他同学的提交内容</span>
              </span>
            </span>
            <label class="switch" aria-label="是否公开作业提交">
              <input v-model="assignmentForm.is_public" type="checkbox" />
              <span class="slider"></span>
            </label>
          </div>
          <label>
            附件
            <input
              ref="assignmentFileInput"
              type="file"
              accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              @change="handleAssignmentFileChange"
            />
          </label>
          <p class="muted selected-file-line">
            支持 HTML、图片、PDF 和 Word。{{ assignmentDialogItem ? '上传新附件会替换原附件。' : '附件可选。' }}
          </p>
          <p v-if="assignmentFile" class="muted selected-file-line">
            {{ assignmentFile.name }} / {{ formatFileSize(assignmentFile.size) }}
          </p>
          <p v-else-if="assignmentDialogItem?.files?.length" class="muted selected-file-line">
            当前附件：{{ assignmentDialogItem.files.map((file) => file.original_filename).join('、') }}
          </p>
          <p v-if="assignmentError" class="error">{{ assignmentError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeAssignmentDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="assignmentDetailOpen" class="overlay">
      <div class="modal assignment-teacher-submission-modal">
        <div class="modal-header">
          <h3>{{ assignmentTitlePreview }} · 提交历史</h3>
          <button class="ghost" type="button" @click="closeAssignmentDetail">关闭</button>
        </div>
        <div v-if="loadingAssignmentDetail" class="loading">加载中...</div>
        <div v-else class="assignment-teacher-submission-layout">
          <aside class="assignment-submission-sidebar">
            <button
              v-for="submission in studentSubmissionRows"
              :key="submission.id"
              class="assignment-submission-history-button"
              :class="{ active: selectedStudentSubmission?.id === submission.id }"
              type="button"
              @click="selectStudentSubmission(submission)"
            >
              <strong>第 {{ submission.attempt_number }} 次提交</strong>
              <span>{{ formatDateTime(submission.created_at) }}</span>
            </button>
            <div v-if="!studentSubmissionRows.length" class="empty assignment-empty">暂无提交记录</div>
          </aside>

          <div class="assignment-submission-detail-pane">
            <h4>提交内容</h4>
            <div class="assignment-detail-card">
              <h5>提交文本</h5>
              <div class="assignment-detail-card-body">
                <textarea v-model.trim="historySubmissionForm.text_content" rows="5" placeholder="可选"></textarea>
              </div>
            </div>
            <div class="assignment-detail-card">
              <h5>提交文件</h5>
              <div class="assignment-detail-card-body">
                <input
                  ref="historySubmissionFileInput"
                  type="file"
                  accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                  @change="handleHistorySubmissionFileChange"
                />
                <p v-if="historySubmissionFile" class="muted selected-file-line">
                  {{ historySubmissionFile.name }} / {{ formatFileSize(historySubmissionFile.size) }}
                </p>
                <div v-else-if="selectedStudentSubmission?.files?.length" class="assignment-file-list assignment-file-action-list assignment-file-action-stack">
                  <div v-for="file in selectedStudentSubmission.files" :key="file.id" class="assignment-file-action-row">
                    <span>{{ file.original_filename }}</span>
                    <button class="ghost" type="button" @click="viewSubmissionFile(file)">查看</button>
                    <button class="ghost" type="button" @click="downloadSubmissionFile(file)">下载</button>
                  </div>
                </div>
                <p v-else class="muted assignment-content-text">未上传提交文件。</p>
              </div>
            </div>
            <p v-if="historySubmissionError" class="error">{{ historySubmissionError }}</p>
          </div>

          <div class="assignment-feedback-pane">
            <h4>教师反馈</h4>
            <div class="assignment-detail-card">
              <h5>反馈内容</h5>
              <div class="assignment-detail-card-body">
                <p v-if="selectedStudentFeedback?.text_content" class="assignment-content-text">{{ selectedStudentFeedback.text_content }}</p>
                <p v-else class="muted assignment-content-text">暂无反馈内容。</p>
              </div>
            </div>
            <div class="assignment-detail-card">
              <h5>反馈文件</h5>
              <div class="assignment-detail-card-body">
                <div v-if="selectedStudentFeedback?.files?.length" class="assignment-file-list assignment-file-action-list assignment-file-action-stack">
                  <div v-for="file in selectedStudentFeedback.files" :key="file.id" class="assignment-file-action-row">
                    <span>{{ file.original_filename }}</span>
                    <button class="ghost" type="button" @click="viewFeedbackFile(file)">查看</button>
                    <button class="ghost" type="button" @click="downloadFeedbackFile(file)">下载</button>
                  </div>
                </div>
                <p v-else class="muted assignment-content-text">暂无反馈文件。</p>
              </div>
            </div>
          </div>
        </div>
        <p v-if="assignmentDetailError" class="error">{{ assignmentDetailError }}</p>
      </div>
    </div>

    <div v-if="submissionDialogOpen" class="overlay">
      <div class="modal assignment-submission-submit-modal">
        <div class="modal-header">
          <h3>{{ assignmentTitlePreview }} · 提交</h3>
          <button class="ghost" type="button" @click="closeSubmissionDialog">关闭</button>
        </div>
        <div v-if="loadingAssignmentDetail" class="loading">加载中...</div>
        <form v-else class="assignment-submission-detail-pane" @submit.prevent="submitAssignmentSubmission">
          <h4>提交内容</h4>
          <div class="assignment-detail-card">
            <h5>提交文本</h5>
            <div class="assignment-detail-card-body">
              <textarea v-model.trim="submissionForm.text_content" rows="5" placeholder="可选"></textarea>
            </div>
          </div>
          <div class="assignment-detail-card">
            <h5>提交文件</h5>
            <div class="assignment-detail-card-body">
              <input
                ref="submissionFileInput"
                type="file"
                accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                @change="handleSubmissionFileChange"
              />
              <p v-if="submissionFile" class="muted selected-file-line">
                {{ submissionFile.name }} / {{ formatFileSize(submissionFile.size) }}
              </p>
            </div>
          </div>
          <p v-if="submissionError" class="error">{{ submissionError }}</p>
          <div class="modal-actions assignment-inline-actions">
            <button class="ghost" type="button" :disabled="savingAction" @click="saveSubmissionDraft">保存</button>
            <button class="danger" type="submit" :disabled="savingAction">{{ savingAction ? '提交中...' : '提交' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="teacherSubmissionDialog" class="overlay">
      <div class="modal assignment-teacher-submission-modal">
        <div class="modal-header">
          <h3>{{ assignmentTitlePreview }} · {{ teacherSubmissionDialog.username || '-' }} 的提交记录</h3>
          <button class="ghost" type="button" @click="closeTeacherSubmissionDialog">关闭</button>
        </div>
	        <div class="assignment-teacher-submission-layout">
	          <aside class="assignment-submission-sidebar">
            <button
              v-for="submission in teacherSubmissionDialog.submissions"
              :key="submission.id"
              class="assignment-submission-history-button"
              :class="{ active: selectedTeacherSubmission?.id === submission.id }"
              type="button"
              @click="selectedTeacherSubmissionId = submission.id"
            >
              <strong>第 {{ submission.attempt_number }} 次提交</strong>
              <span>{{ formatDateTime(submission.created_at) }}</span>
            </button>
	          </aside>
	          <div class="assignment-submission-detail-pane">
	            <template v-if="selectedTeacherSubmission">
	              <h4>提交内容</h4>
	              <div class="assignment-detail-card">
	                <h5>学生提交文本</h5>
	                <div class="assignment-detail-card-body">
	                  <p v-if="selectedTeacherSubmission.text_content" class="assignment-content-text">{{ selectedTeacherSubmission.text_content }}</p>
	                  <p v-else class="muted assignment-content-text">未填写文本内容。</p>
	                </div>
	              </div>
	              <div class="assignment-detail-card">
	                <h5>学生提交文件</h5>
	                <div class="assignment-detail-card-body">
	                  <div v-if="selectedTeacherSubmission.files?.length" class="assignment-file-list assignment-file-action-list assignment-file-action-stack">
	                    <div v-for="file in selectedTeacherSubmission.files" :key="file.id" class="assignment-file-action-row">
	                      <span>{{ file.original_filename }}</span>
	                      <button class="ghost" type="button" @click="viewSubmissionFile(file)">查看</button>
	                      <button class="ghost" type="button" @click="downloadSubmissionFile(file)">下载</button>
	                    </div>
	                  </div>
	                  <p v-else class="muted assignment-content-text">未上传提交文件。</p>
	                </div>
	              </div>
	            </template>
	            <div v-else class="empty assignment-empty">暂无提交记录</div>
	          </div>

		          <form v-if="selectedTeacherSubmission" class="assignment-feedback-pane" @submit.prevent="submitFeedback">
		            <h4>教师反馈</h4>
		            <div class="assignment-detail-card">
		              <h5>反馈内容</h5>
		              <div class="assignment-detail-card-body">
		                <textarea v-model.trim="feedbackForm.text_content" rows="5" placeholder="可选"></textarea>
		              </div>
		            </div>
		            <div class="assignment-detail-card">
		              <h5>反馈文件</h5>
		              <div class="assignment-detail-card-body">
		                <input
		                  ref="feedbackFileInput"
		                  type="file"
		                  accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
		                  @change="handleFeedbackFileChange"
		                />
		                <p v-if="feedbackFile" class="muted selected-file-line">
		                  {{ feedbackFile.name }} / {{ formatFileSize(feedbackFile.size) }}
		                </p>
		                <div v-else-if="teacherSubmissionDialog.feedback?.files?.length" class="assignment-file-list assignment-file-action-list assignment-file-action-stack">
		                  <div v-for="file in teacherSubmissionDialog.feedback.files" :key="file.id" class="assignment-file-action-row">
		                    <span>当前反馈附件：{{ file.original_filename }}</span>
		                    <button class="ghost" type="button" @click="viewFeedbackFile(file)">查看</button>
		                    <button class="ghost" type="button" @click="downloadFeedbackFile(file)">下载</button>
		                  </div>
		                </div>
		              </div>
		            </div>
		            <p v-if="feedbackError" class="error">{{ feedbackError }}</p>
	            <div class="modal-actions assignment-inline-actions">
	              <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '提交反馈' }}</button>
	            </div>
	          </form>
	          <div v-else class="assignment-feedback-pane">
	            <h4>教师反馈</h4>
	            <div class="empty assignment-empty">暂无提交记录</div>
	          </div>
	        </div>
      </div>
    </div>

    <div v-if="deleteAssignmentDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认删除课程作业</h3>
          <button class="ghost" type="button" @click="closeDeleteAssignmentDialog">关闭</button>
        </div>
        <p>即将删除课程作业：<strong>{{ deleteAssignmentDialog.title }}</strong></p>
        <p class="muted">作业、附件、学生提交记录和教师反馈都会被删除。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDeleteAssignmentDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitDeleteAssignment">
            {{ savingAction ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiRequest, ApiError, getApiRoot, getAuthToken } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { state, logout, isTeacher } = useAuth();

const detail = ref(null);
const loadingDetail = ref(false);
const loadingMaterials = ref(false);
const error = ref('');
const materialsError = ref('');
const savingAction = ref(false);
const toast = reactive({ visible: false, message: '', type: 'info' });

const renameDialogOpen = ref(false);
const renameError = ref('');
const renameForm = reactive({ name: '' });
const removeMemberDialog = ref(null);
const dissolveDialogOpen = ref(false);
const activeDetailView = ref('materials');
const detailViewOptions = [
  { key: 'materials', label: '课程资料' },
  { key: 'assignments', label: '课程作业' },
  { key: 'members', label: '班级成员' }
];

const materialsRows = ref([]);
const materialsTotal = ref(0);
const materialsPage = ref(1);
const materialsPageSize = ref(20);
const materialsPageJump = ref(1);
const materialsKeyword = ref('');
const materialsOrder = ref('desc');

const uploadDialogOpen = ref(false);
const uploadFile = ref(null);
const uploadError = ref('');
const uploadForm = reactive({ title: '' });
const fileInput = ref(null);

const editMaterialDialog = ref(null);
const editMaterialError = ref('');
const editMaterialForm = reactive({ title: '' });

const deleteMaterialDialog = ref(null);

const loadingAssignments = ref(false);
const assignmentsError = ref('');
const assignmentsRows = ref([]);
const assignmentsTotal = ref(0);
const assignmentsPage = ref(1);
const assignmentsPageSize = ref(20);
const assignmentsPageJump = ref(1);
const assignmentsKeyword = ref('');
const assignmentsOrder = ref('desc');
const assignmentsSubmissionOrder = ref('');

const assignmentDialogOpen = ref(false);
const assignmentDialogItem = ref(null);
const assignmentForm = reactive({ title: '', content: '', is_public: false });
const assignmentFile = ref(null);
const assignmentError = ref('');
const assignmentFileInput = ref(null);
const deleteAssignmentDialog = ref(null);

const assignmentDetailOpen = ref(false);
const submissionDialogOpen = ref(false);
const loadingAssignmentDetail = ref(false);
const assignmentDetailError = ref('');
const assignmentDetail = ref(null);
const assignmentSubmissions = ref([]);
const assignmentStudentRows = ref([]);

const submissionForm = reactive({ text_content: '' });
const submissionFile = ref(null);
const submissionError = ref('');
const submissionFileInput = ref(null);
const historySubmissionForm = reactive({ text_content: '' });
const historySubmissionFile = ref(null);
const historySubmissionError = ref('');
const historySubmissionFileInput = ref(null);
const selectedStudentSubmissionId = ref(null);

const feedbackDialogSubmission = ref(null);
const teacherSubmissionDialog = ref(null);
const selectedTeacherSubmissionId = ref(null);
const feedbackForm = reactive({ text_content: '' });
const feedbackFile = ref(null);
const feedbackError = ref('');
const feedbackFileInput = ref(null);

const isCreator = computed(() => !!detail.value?.is_creator);
const canManageMaterials = computed(() => String(detail.value?.member_role || '').trim() === 'teacher');
const canManageAssignments = computed(() => String(detail.value?.member_role || '').trim() === 'teacher');
const canUploadMaterials = computed(() => canManageMaterials.value || !!detail.value?.allow_student_uploads);
const canConfigureStudentUploads = computed(() => canManageMaterials.value && activeDetailView.value === 'members');
const canDissolveClass = computed(() => isTeacher.value && isCreator.value && activeDetailView.value === 'members');
const isTeacherAssignmentDetailView = computed(() => (
  activeDetailView.value === 'assignments' && canManageAssignments.value && !!assignmentDetail.value
));
const classDetailTitle = computed(() => {
  const className = detail.value?.name || (isTeacher.value ? '班级详情' : '我的班级');
  if (!isTeacherAssignmentDetailView.value) return className;
  return `${className}：「${truncateDisplayText(assignmentDetail.value?.title || '', 20)}」提交情况`;
});
const materialsTotalPages = computed(() => Math.max(1, Math.ceil(materialsTotal.value / materialsPageSize.value)));
const assignmentsTotalPages = computed(() => Math.max(1, Math.ceil(assignmentsTotal.value / assignmentsPageSize.value)));
const classStudentTotal = computed(() => Number(detail.value?.student_count || 0));
const membersPage = ref(1);
const membersPageSize = ref(12);
const membersPageJump = ref(1);
const membersTotal = computed(() => detail.value?.members?.length || 0);
const membersTotalPages = computed(() => Math.max(1, Math.ceil(membersTotal.value / membersPageSize.value)));
const selectedTeacherSubmission = computed(() => {
  const submissions = teacherSubmissionDialog.value?.submissions || [];
  return submissions.find((item) => Number(item.id) === Number(selectedTeacherSubmissionId.value)) || submissions[0] || null;
});
const studentSubmissionRows = computed(() => {
  const currentUserId = Number(state.user?.id || 0);
  const submissions = (assignmentSubmissions.value || []).filter((submission) => (
    !currentUserId || Number(submission.user_id) === currentUserId
  ));
  return submissions.map((submission, index) => ({
    ...submission,
    attempt_number: submissions.length - index
  }));
});
const selectedStudentSubmission = computed(() => (
  studentSubmissionRows.value.find((item) => Number(item.id) === Number(selectedStudentSubmissionId.value)) ||
  studentSubmissionRows.value[0] ||
  null
));
const selectedStudentFeedback = computed(() => selectedStudentSubmission.value?.feedback || null);
const assignmentTitlePreview = computed(() => truncateCharacters(assignmentDetail.value?.title || '课程作业', 10));
const pagedMembers = computed(() => {
  const members = detail.value?.members || [];
  const start = (membersPage.value - 1) * membersPageSize.value;
  return members.slice(start, start + membersPageSize.value);
});

function textDisplayWidth(value) {
  return Array.from(String(value || '')).reduce((total, char) => total + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
}

function truncateDisplayText(value, maxWidth) {
  const text = String(value || '');
  if (!text) return '-';
  let width = 0;
  let result = '';
  for (const char of Array.from(text)) {
    const charWidth = /[\u0000-\u00ff]/.test(char) ? 1 : 2;
    if (width + charWidth > maxWidth) return `${result}...`;
    result += char;
    width += charWidth;
  }
  return result;
}

function truncateCharacters(value, maxLength) {
  const chars = Array.from(String(value || ''));
  if (chars.length <= maxLength) return chars.join('');
  return `${chars.slice(0, maxLength).join('')}...`;
}

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 1600);
}

function handleApiError(err) {
  if (err instanceof ApiError && err.status === 401) {
    showToast('登录已过期', 'error');
    logout();
    router.push({ name: 'Login' });
    return;
  }
  showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
}

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

function memberRoleLabel(role) {
  return role === 'teacher' ? '教师' : '学生';
}

function formatMaterialType(item) {
  return item.file_format || String(item.original_filename || '').split('.').pop()?.toUpperCase() || '文件';
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

async function fetchRaw(path, options = {}) {
  const response = await fetch(`${getApiRoot()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${getAuthToken()}`
    }
  });
  if (response.status === 401) {
    logout();
    router.push({ name: 'Login' });
    throw new ApiError('登录已过期', { status: 401 });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || '请求失败', { status: response.status, data });
  }
  return response;
}

async function loadDetail() {
  loadingDetail.value = true;
  error.value = '';
  try {
    detail.value = await apiRequest(`/api/user/classes/${route.params.id}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingDetail.value = false;
  }
}

async function refreshMaterials() {
  loadingMaterials.value = true;
  materialsError.value = '';
  try {
    const data = await apiRequest(`/api/user/classes/${route.params.id}/materials`, {
      params: {
        limit: materialsPageSize.value,
        offset: (materialsPage.value - 1) * materialsPageSize.value,
        keyword: materialsKeyword.value,
        id_order: materialsOrder.value
      }
    });
    materialsRows.value = data.rows || [];
    materialsTotal.value = data.total || 0;
    materialsPageJump.value = materialsPage.value;
  } catch (err) {
    materialsError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingMaterials.value = false;
  }
}

async function reloadAll() {
  await loadDetail();
  await Promise.all([refreshMaterials(), refreshAssignments()]);
}

async function refreshAssignments() {
  loadingAssignments.value = true;
  assignmentsError.value = '';
  try {
    const data = await apiRequest(`/api/user/classes/${route.params.id}/assignments`, {
      params: {
        limit: assignmentsPageSize.value,
        offset: (assignmentsPage.value - 1) * assignmentsPageSize.value,
        keyword: assignmentsKeyword.value,
        id_order: assignmentsOrder.value,
        submission_order: assignmentsSubmissionOrder.value
      }
    });
    assignmentsRows.value = data.rows || [];
    assignmentsTotal.value = data.total || 0;
    assignmentsPageJump.value = assignmentsPage.value;
  } catch (err) {
    assignmentsError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingAssignments.value = false;
  }
}

function changeMembersPage(nextPage) {
  membersPage.value = Math.min(Math.max(1, nextPage), membersTotalPages.value);
  membersPageJump.value = membersPage.value;
}

function jumpToMembersPage() {
  changeMembersPage(Number(membersPageJump.value || 1));
}

async function copyClassCode(item) {
  try {
    await navigator.clipboard.writeText(item.code || '');
    showToast(`班级码已复制：${item.code}`, 'success');
  } catch (copyError) {
    showToast(`复制失败，请手动记录：${item.code}`, 'error');
  }
}

function goBack() {
  router.push({ name: 'Classes' });
}

function changeMaterialsPage(nextPage) {
  materialsPage.value = Math.min(Math.max(1, nextPage), materialsTotalPages.value);
  refreshMaterials();
}

function jumpToMaterialsPage() {
  changeMaterialsPage(Number(materialsPageJump.value || 1));
}

function toggleMaterialsOrder() {
  materialsOrder.value = materialsOrder.value === 'asc' ? 'desc' : 'asc';
  materialsPage.value = 1;
  refreshMaterials();
}

function changeAssignmentsPage(nextPage) {
  assignmentsPage.value = Math.min(Math.max(1, nextPage), assignmentsTotalPages.value);
  refreshAssignments();
}

function jumpToAssignmentsPage() {
  changeAssignmentsPage(Number(assignmentsPageJump.value || 1));
}

function toggleAssignmentsOrder() {
  assignmentsOrder.value = assignmentsOrder.value === 'asc' ? 'desc' : 'asc';
  assignmentsPage.value = 1;
  refreshAssignments();
}

function toggleAssignmentsSubmissionOrder() {
  assignmentsSubmissionOrder.value = assignmentsSubmissionOrder.value === 'desc'
    ? 'asc'
    : assignmentsSubmissionOrder.value === 'asc'
      ? 'desc'
      : 'desc';
  assignmentsPage.value = 1;
  refreshAssignments();
}

function openRenameDialog() {
  renameForm.name = detail.value?.name || '';
  renameError.value = '';
  renameDialogOpen.value = true;
}

function closeRenameDialog() {
  renameDialogOpen.value = false;
  renameError.value = '';
}

async function submitRenameClass() {
  renameError.value = '';
  if (!renameForm.name.trim()) {
    renameError.value = '请输入班级名';
    return;
  }
  if (textDisplayWidth(renameForm.name.trim()) > 40) {
    renameError.value = '班级名称不得超过20个字';
    return;
  }

  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}`, {
      method: 'PUT',
      body: { name: renameForm.name.trim() }
    });
    closeRenameDialog();
    await loadDetail();
    showToast('班级名称已更新', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) renameError.value = err.message;
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function confirmRemoveMember(member) {
  removeMemberDialog.value = member;
}

function closeRemoveMemberDialog() {
  removeMemberDialog.value = null;
}

function confirmDissolveClass() {
  dissolveDialogOpen.value = true;
}

function closeDissolveDialog() {
  dissolveDialogOpen.value = false;
}

async function submitRemoveMember() {
  if (!removeMemberDialog.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/members/${removeMemberDialog.value.user_id}`, {
      method: 'DELETE'
    });
    closeRemoveMemberDialog();
    await loadDetail();
    showToast('学生已移除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function submitDissolveClass() {
  if (!detail.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}`, {
      method: 'DELETE'
    });
    closeDissolveDialog();
    router.push({ name: 'Classes' });
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function toggleStudentUploadPermission(event) {
  if (!detail.value) return;
  const nextValue = !!event.target.checked;
  const previousValue = !!detail.value.allow_student_uploads;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}`, {
      method: 'PUT',
      body: { allow_student_uploads: nextValue }
    });
    detail.value = {
      ...detail.value,
      allow_student_uploads: nextValue
    };
    showToast(nextValue ? '已允许学生上传课程资料' : '已关闭学生上传课程资料', 'success');
  } catch (err) {
    event.target.checked = previousValue;
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function openUploadDialog() {
  uploadDialogOpen.value = true;
  uploadForm.title = '';
  uploadFile.value = null;
  uploadError.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

function closeUploadDialog() {
  uploadDialogOpen.value = false;
  uploadError.value = '';
}

function handleFileChange(event) {
  uploadError.value = '';
  const file = event.target.files?.[0] || null;
  uploadFile.value = file;
  if (!file) return;
  uploadError.value = validateClassFile(file);
}

function validateClassFile(file) {
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf');
  const isHtml = name.endsWith('.html') || name.endsWith('.htm');
  const isDoc = name.endsWith('.doc') || name.endsWith('.docx');
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif|ico|tiff?|heic|heif)$/i.test(file.name);
  if (!isPdf && !isHtml && !isImage && !isDoc) {
    return '仅支持 HTML、图片、PDF 或 Word 文件';
  }
  if (isDoc && file.size > 200 * 1024 * 1024) return 'Word 文件不能超过 200MB';
  if (isPdf && file.size > 200 * 1024 * 1024) return 'PDF 文件不能超过 200MB';
  if (isImage && file.size > 20 * 1024 * 1024) return '图片文件不能超过 20MB';
  if (isHtml && file.size > 10 * 1024 * 1024) return 'HTML 文件不能超过 10MB';
  return '';
}

async function submitUploadMaterial() {
  uploadError.value = '';
  if (!uploadFile.value) {
    uploadError.value = '请选择文件';
    return;
  }
  handleFileChange({ target: { files: [uploadFile.value] } });
  if (uploadError.value) return;

  savingAction.value = true;
  try {
    await fetchRaw(`/api/user/classes/${route.params.id}/materials/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': uploadFile.value.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(uploadFile.value.name),
        'X-Title': encodeURIComponent(uploadForm.title.trim())
      },
      body: uploadFile.value
    });
    closeUploadDialog();
    materialsPage.value = 1;
    await Promise.all([loadDetail(), refreshMaterials()]);
    showToast('课程资料已上传', 'success');
  } catch (err) {
    uploadError.value = err instanceof ApiError ? err.message : '上传失败';
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function openEditDialog(item) {
  if (!item?.can_edit) return;
  editMaterialDialog.value = item;
  editMaterialForm.title = item.title || '';
  editMaterialError.value = '';
}

function closeEditDialog() {
  editMaterialDialog.value = null;
  editMaterialError.value = '';
}

async function submitEditMaterial() {
  editMaterialError.value = '';
  if (!editMaterialForm.title.trim()) {
    editMaterialError.value = '请输入标题';
    return;
  }
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/materials/${editMaterialDialog.value.id}`, {
      method: 'PUT',
      body: { title: editMaterialForm.title.trim() }
    });
    closeEditDialog();
    await refreshMaterials();
    showToast('标题已更新', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) editMaterialError.value = err.message;
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function confirmDeleteMaterial(item) {
  if (!item?.can_delete) return;
  deleteMaterialDialog.value = item;
}

function closeDeleteMaterialDialog() {
  deleteMaterialDialog.value = null;
}

async function submitDeleteMaterial() {
  if (!deleteMaterialDialog.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/materials/${deleteMaterialDialog.value.id}`, {
      method: 'DELETE'
    });
    closeDeleteMaterialDialog();
    await Promise.all([loadDetail(), refreshMaterials()]);
    showToast('课程资料已删除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function materialBlob(item) {
  const response = await fetchRaw(`/api/user/classes/${route.params.id}/materials/${item.id}/content`);
  return response.blob();
}

async function downloadMaterial(item) {
  try {
    const blob = await materialBlob(item);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.original_filename || `${item.title || 'class-material'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    handleApiError(err);
  }
}

function handleAssignmentFileChange(event) {
  assignmentError.value = '';
  assignmentFile.value = event.target.files?.[0] || null;
  if (assignmentFile.value) assignmentError.value = validateClassFile(assignmentFile.value);
}

function handleSubmissionFileChange(event) {
  submissionError.value = '';
  submissionFile.value = event.target.files?.[0] || null;
  if (submissionFile.value) submissionError.value = validateClassFile(submissionFile.value);
}

function handleHistorySubmissionFileChange(event) {
  historySubmissionError.value = '';
  historySubmissionFile.value = event.target.files?.[0] || null;
  if (historySubmissionFile.value) historySubmissionError.value = validateClassFile(historySubmissionFile.value);
}

function handleFeedbackFileChange(event) {
  feedbackError.value = '';
  feedbackFile.value = event.target.files?.[0] || null;
  if (feedbackFile.value) feedbackError.value = validateClassFile(feedbackFile.value);
}

function openAssignmentDialog(item = null) {
  assignmentDialogItem.value = item;
  assignmentForm.title = item?.title || '';
  assignmentForm.content = item?.content || '';
  assignmentForm.is_public = !!item?.is_public;
  assignmentFile.value = null;
  assignmentError.value = '';
  assignmentDialogOpen.value = true;
  if (assignmentFileInput.value) assignmentFileInput.value.value = '';
}

function closeAssignmentDialog() {
  assignmentDialogOpen.value = false;
  assignmentDialogItem.value = null;
  assignmentError.value = '';
}

async function submitAssignment() {
  assignmentError.value = '';
  if (!assignmentForm.title.trim()) {
    assignmentError.value = '请输入作业名';
    return;
  }
  if (assignmentFile.value) {
    assignmentError.value = validateClassFile(assignmentFile.value);
    if (assignmentError.value) return;
  }

  const path = assignmentDialogItem.value
    ? `/api/user/classes/${route.params.id}/assignments/${assignmentDialogItem.value.id}`
    : `/api/user/classes/${route.params.id}/assignments`;
  const method = assignmentDialogItem.value ? 'PUT' : 'POST';

  savingAction.value = true;
  try {
    if (assignmentFile.value) {
      await fetchRaw(path, {
        method,
        headers: {
          'Content-Type': assignmentFile.value.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(assignmentFile.value.name),
          'X-Assignment-Title': encodeURIComponent(assignmentForm.title.trim()),
          'X-Assignment-Content': encodeURIComponent(assignmentForm.content.trim()),
          'X-Assignment-Public': assignmentForm.is_public ? 'true' : 'false'
        },
        body: assignmentFile.value
      });
    } else {
      await apiRequest(path, {
        method,
        body: {
          title: assignmentForm.title.trim(),
          content: assignmentForm.content.trim(),
          is_public: assignmentForm.is_public
        },
        timeout: 20000
      });
    }
    closeAssignmentDialog();
    await refreshAssignments();
    if (assignmentDetail.value?.id === assignmentDialogItem.value?.id) {
      await loadAssignmentDetail(assignmentDetail.value.id);
    }
    showToast(assignmentDialogItem.value ? '作业已更新' : '作业已发布', 'success');
  } catch (err) {
    assignmentError.value = err instanceof ApiError ? err.message : '保存失败';
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function loadAssignmentDetail(id) {
  loadingAssignmentDetail.value = true;
  assignmentDetailError.value = '';
  try {
    const data = await apiRequest(`/api/user/classes/${route.params.id}/assignments/${id}`);
    assignmentDetail.value = data.assignment || null;
    assignmentSubmissions.value = data.submissions || [];
    assignmentStudentRows.value = data.student_submissions || [];
  } catch (err) {
    assignmentDetailError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingAssignmentDetail.value = false;
  }
}

function submissionDraftKey(id = assignmentDetail.value?.id) {
  return `sounichinavi:assignment-submission-draft:${route.params.id}:${id || ''}`;
}

function loadSubmissionDraft(id) {
  try {
    return localStorage.getItem(submissionDraftKey(id)) || '';
  } catch (error) {
    return '';
  }
}

function clearSubmissionDraft(id) {
  try {
    localStorage.removeItem(submissionDraftKey(id));
  } catch (error) {
    // ignore storage errors
  }
}

function saveSubmissionDraft() {
  if (!assignmentDetail.value?.id) return;
  try {
    localStorage.setItem(submissionDraftKey(), submissionForm.text_content || '');
    showToast('草稿已保存', 'success');
  } catch (error) {
    submissionError.value = '草稿保存失败';
  }
}

function resetSubmissionForm({ loadDraft = false, assignmentId = null } = {}) {
  submissionForm.text_content = loadDraft ? loadSubmissionDraft(assignmentId) : '';
  submissionFile.value = null;
  submissionError.value = '';
  if (submissionFileInput.value) submissionFileInput.value.value = '';
}

function resetHistorySubmissionForm() {
  historySubmissionForm.text_content = '';
  historySubmissionFile.value = null;
  historySubmissionError.value = '';
  if (historySubmissionFileInput.value) historySubmissionFileInput.value.value = '';
}

function selectStudentSubmission(submission) {
  selectedStudentSubmissionId.value = submission?.id || null;
  historySubmissionForm.text_content = submission?.text_content || '';
  historySubmissionFile.value = null;
  historySubmissionError.value = '';
  if (historySubmissionFileInput.value) historySubmissionFileInput.value.value = '';
}

async function openAssignmentDetail(item) {
  assignmentDetail.value = item;
  assignmentSubmissions.value = [];
  assignmentStudentRows.value = [];
  await loadAssignmentDetail(item.id);
}

async function openStudentSubmissionHistory(item) {
  assignmentDetail.value = item;
  assignmentSubmissions.value = [];
  assignmentStudentRows.value = [];
  selectedStudentSubmissionId.value = null;
  resetHistorySubmissionForm();
  assignmentDetailOpen.value = true;
  await loadAssignmentDetail(item.id);
  selectStudentSubmission(studentSubmissionRows.value[0] || null);
}

async function openSubmissionDialog(item) {
  assignmentDetail.value = item;
  assignmentSubmissions.value = [];
  assignmentStudentRows.value = [];
  resetSubmissionForm({ loadDraft: true, assignmentId: item.id });
  submissionDialogOpen.value = true;
  await loadAssignmentDetail(item.id);
}

function closeAssignmentDetail() {
  assignmentDetailOpen.value = false;
  assignmentDetail.value = null;
  assignmentSubmissions.value = [];
  assignmentStudentRows.value = [];
  assignmentDetailError.value = '';
  selectedStudentSubmissionId.value = null;
  resetHistorySubmissionForm();
}

function closeSubmissionDialog() {
  submissionDialogOpen.value = false;
  assignmentDetail.value = null;
  assignmentSubmissions.value = [];
  assignmentStudentRows.value = [];
  assignmentDetailError.value = '';
  resetSubmissionForm();
}

function returnToAssignmentsList() {
  closeTeacherSubmissionDialog();
  closeAssignmentDetail();
  refreshAssignments();
}

async function submitAssignmentSubmission() {
  submissionError.value = '';
  const activeAssignmentId = assignmentDetail.value?.id;
  if (!activeAssignmentId) {
    submissionError.value = '请选择作业';
    return;
  }
  if (submissionFile.value) {
    submissionError.value = validateClassFile(submissionFile.value);
    if (submissionError.value) return;
  }
  if (!submissionForm.text_content.trim() && !submissionFile.value) {
    submissionError.value = '请填写提交内容或上传文件';
    return;
  }

  savingAction.value = true;
  try {
    const path = `/api/user/classes/${route.params.id}/assignments/${activeAssignmentId}/submissions`;
    if (submissionFile.value) {
      await fetchRaw(path, {
        method: 'POST',
        headers: {
          'Content-Type': submissionFile.value.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(submissionFile.value.name),
          'X-Submission-Content': encodeURIComponent(submissionForm.text_content.trim())
        },
        body: submissionFile.value
      });
    } else {
      await apiRequest(path, {
        method: 'POST',
        body: { text_content: submissionForm.text_content.trim() },
        timeout: 20000
      });
    }
    clearSubmissionDraft(activeAssignmentId);
    resetSubmissionForm();
    await Promise.all([loadAssignmentDetail(activeAssignmentId), refreshAssignments()]);
    showToast('作业已提交', 'success');
  } catch (err) {
    submissionError.value = err instanceof ApiError ? err.message : '提交失败';
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function openFeedbackDialog(submission) {
  feedbackDialogSubmission.value = submission;
  feedbackForm.text_content = submission.feedback?.text_content || '';
  feedbackFile.value = null;
  feedbackError.value = '';
  if (feedbackFileInput.value) feedbackFileInput.value.value = '';
}

function closeFeedbackDialog() {
  feedbackDialogSubmission.value = null;
  feedbackError.value = '';
}

function openTeacherSubmissionDialog(student) {
  if (!student?.submitted) return;
  teacherSubmissionDialog.value = student;
  selectedTeacherSubmissionId.value = student.submissions?.[0]?.id || null;
  feedbackForm.text_content = student.feedback?.text_content || '';
  feedbackFile.value = null;
  feedbackError.value = '';
  if (feedbackFileInput.value) feedbackFileInput.value.value = '';
}

function closeTeacherSubmissionDialog() {
  teacherSubmissionDialog.value = null;
  selectedTeacherSubmissionId.value = null;
  feedbackFile.value = null;
  feedbackError.value = '';
}

async function submitFeedback() {
  feedbackError.value = '';
  if (feedbackFile.value) {
    feedbackError.value = validateClassFile(feedbackFile.value);
    if (feedbackError.value) return;
  }
  const activeTeacherFeedback = teacherSubmissionDialog.value?.feedback;
  const activeSubmission = selectedTeacherSubmission.value || feedbackDialogSubmission.value;
  const hasExistingFile = !!(activeTeacherFeedback?.files?.length || feedbackDialogSubmission.value?.feedback?.files?.length);
  if (!feedbackForm.text_content.trim() && !feedbackFile.value && !hasExistingFile) {
    feedbackError.value = '请填写反馈内容或上传文件';
    return;
  }
  if (!activeSubmission) {
    feedbackError.value = '请选择提交记录';
    return;
  }

  savingAction.value = true;
  try {
    const path = `/api/user/classes/${route.params.id}/assignments/${assignmentDetail.value.id}/submissions/${activeSubmission.id}/feedback`;
    if (feedbackFile.value) {
      await fetchRaw(path, {
        method: 'POST',
        headers: {
          'Content-Type': feedbackFile.value.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(feedbackFile.value.name),
          'X-Feedback-Content': encodeURIComponent(feedbackForm.text_content.trim())
        },
        body: feedbackFile.value
      });
    } else {
      await apiRequest(path, {
        method: 'POST',
        body: { text_content: feedbackForm.text_content.trim() },
        timeout: 20000
      });
    }
    const activeStudentUserId = teacherSubmissionDialog.value?.user_id;
    await loadAssignmentDetail(assignmentDetail.value.id);
    if (activeStudentUserId) {
      const updatedStudent = assignmentStudentRows.value.find((item) => Number(item.user_id) === Number(activeStudentUserId));
      if (updatedStudent) {
        teacherSubmissionDialog.value = updatedStudent;
        feedbackForm.text_content = updatedStudent.feedback?.text_content || feedbackForm.text_content;
      }
      feedbackFile.value = null;
      if (feedbackFileInput.value) feedbackFileInput.value.value = '';
    } else {
      closeFeedbackDialog();
    }
    showToast('反馈已保存', 'success');
  } catch (err) {
    feedbackError.value = err instanceof ApiError ? err.message : '保存反馈失败';
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function confirmDeleteAssignment(item) {
  deleteAssignmentDialog.value = item;
}

function closeDeleteAssignmentDialog() {
  deleteAssignmentDialog.value = null;
}

async function submitDeleteAssignment() {
  if (!deleteAssignmentDialog.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/assignments/${deleteAssignmentDialog.value.id}`, {
      method: 'DELETE'
    });
    if (assignmentDetail.value?.id === deleteAssignmentDialog.value.id) {
      closeAssignmentDetail();
      closeTeacherSubmissionDialog();
    }
    closeDeleteAssignmentDialog();
    await refreshAssignments();
    showToast('课程作业已删除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function assignmentFileBlob(path) {
  const response = await fetchRaw(path);
  return response.blob();
}

async function viewNamedFile(path) {
  try {
    const blob = await assignmentFileBlob(path);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    handleApiError(err);
  }
}

async function downloadNamedFile(path, filename) {
  try {
    const blob = await assignmentFileBlob(path);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'assignment-file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    handleApiError(err);
  }
}

function downloadAssignmentFile(file) {
  downloadNamedFile(`/api/user/classes/${route.params.id}/assignments/files/${file.id}/content`, file.original_filename);
}

function downloadSubmissionFile(file) {
  downloadNamedFile(`/api/user/classes/${route.params.id}/assignments/submission-files/${file.id}/content`, file.original_filename);
}

function viewSubmissionFile(file) {
  viewNamedFile(`/api/user/classes/${route.params.id}/assignments/submission-files/${file.id}/content`);
}

function downloadFeedbackFile(file) {
  downloadNamedFile(`/api/user/classes/${route.params.id}/assignments/feedback-files/${file.id}/content`, file.original_filename);
}

function viewFeedbackFile(file) {
  viewNamedFile(`/api/user/classes/${route.params.id}/assignments/feedback-files/${file.id}/content`);
}

watch(() => materialsKeyword.value, () => {
  materialsPage.value = 1;
  refreshMaterials();
});

watch(() => assignmentsKeyword.value, () => {
  assignmentsPage.value = 1;
  refreshAssignments();
});

watch(detail, () => {
  if (membersPage.value > membersTotalPages.value) {
    membersPage.value = membersTotalPages.value;
  }
  membersPageJump.value = membersPage.value;
});

onMounted(async () => {
  await reloadAll();
});
</script>
