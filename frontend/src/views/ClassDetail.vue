<template>
  <section class="card class-detail-page">
    <div class="class-detail-header">
      <div>
        <h2>{{ detail?.name || (isTeacher ? '班级详情' : '我的班级') }}</h2>
      </div>
      <div class="class-detail-header-actions">
        <div v-if="detail && activeDetailView === 'materials'" class="class-detail-header-search-tools">
          <input v-model.trim="materialsKeyword" placeholder="搜索标题/文件名" @keydown.enter.prevent="refreshMaterials" />
          <button class="ghost" @click="toggleMaterialsOrder" :disabled="loadingMaterials">
            {{ materialsOrder === 'asc' ? '最新优先' : '最早优先' }}
          </button>
          <button class="ghost" @click="refreshMaterials" :disabled="loadingMaterials">刷新</button>
        </div>
        <div v-if="detail && activeDetailView === 'assignments'" class="class-detail-header-search-tools">
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
              <button
                v-if="activeDetailView === 'assignments' && canManageAssignments"
                type="button"
                @click="openAssignmentDialog()"
              >
                布置作业
              </button>
              <span v-if="activeDetailView === 'members'" class="muted class-detail-total-text">共 {{ membersTotal }} 人</span>
              <span v-else-if="activeDetailView === 'assignments'" class="muted class-detail-total-text">共 {{ assignmentsTotal }} 个作业</span>
              <span v-else class="muted class-detail-total-text">共 {{ materialsTotal }} 个文件</span>

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
                v-else
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
            <div v-if="assignmentsError" class="error-block">
              <p class="error">{{ assignmentsError }}</p>
              <button class="ghost" @click="refreshAssignments">重试</button>
            </div>
            <div v-else-if="loadingAssignments" class="loading">加载中...</div>
            <div v-else class="management-table-scroll class-detail-table-scroll">
              <table class="table class-assignments-table">
                <thead>
                  <tr>
                    <th>作业名</th>
                    <th>发布者</th>
                    <th>公开</th>
                    <th>提交</th>
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
                      <span v-if="canManageAssignments">{{ item.submission_student_count }} 人 / {{ item.submission_record_count }} 次</span>
                      <span v-else>{{ item.my_submission_count ? `已提交 ${item.my_submission_count} 次` : '未提交' }}</span>
                    </td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <button class="ghost" type="button" @click="openAssignmentDetail(item)">查看</button>
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
      <div class="modal assignment-detail-modal">
        <div class="modal-header">
          <h3>{{ assignmentDetail?.title || '课程作业' }}</h3>
          <button class="ghost" type="button" @click="closeAssignmentDetail">关闭</button>
        </div>
        <div v-if="loadingAssignmentDetail" class="loading">加载中...</div>
        <template v-else-if="assignmentDetail">
          <div class="assignment-detail-meta">
            <span class="tag" :class="assignmentDetail.is_public ? 'success' : 'info'">{{ assignmentDetail.is_public ? '公开提交' : '仅个人可见' }}</span>
            <span class="muted">发布者：{{ assignmentDetail.creator_username || '-' }}</span>
            <span class="muted">发布时间：{{ formatDateTime(assignmentDetail.created_at) }}</span>
          </div>
          <p v-if="assignmentDetail.content" class="assignment-content-text">{{ assignmentDetail.content }}</p>
          <p v-else class="muted assignment-content-text">未填写作业内容。</p>
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

          <form v-if="!canManageAssignments" class="assignment-submit-form" @submit.prevent="submitAssignmentSubmission">
            <h4>我的提交</h4>
            <label>
              提交内容
              <textarea v-model.trim="submissionForm.text_content" rows="4" placeholder="可选"></textarea>
            </label>
            <label>
              提交文件
              <input
                ref="submissionFileInput"
                type="file"
                accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                @change="handleSubmissionFileChange"
              />
            </label>
            <p v-if="submissionFile" class="muted selected-file-line">
              {{ submissionFile.name }} / {{ formatFileSize(submissionFile.size) }}
            </p>
            <p v-if="submissionError" class="error">{{ submissionError }}</p>
            <div class="modal-actions assignment-inline-actions">
              <button type="submit" :disabled="savingAction">{{ savingAction ? '提交中...' : '提交 / 更新' }}</button>
            </div>
          </form>

          <div class="assignment-submissions-list">
            <h4>{{ canManageAssignments ? '提交记录' : (assignmentDetail.is_public ? '提交记录' : '我的提交记录') }}</h4>
            <div v-if="!assignmentSubmissions.length" class="empty assignment-empty">暂无提交记录</div>
            <div v-for="submission in assignmentSubmissions" :key="submission.id" class="assignment-submission-item">
              <div class="assignment-submission-header">
                <strong>{{ submission.student_username || '-' }}</strong>
                <span class="muted">{{ formatDateTime(submission.created_at) }}</span>
              </div>
              <p v-if="submission.text_content" class="assignment-content-text">{{ submission.text_content }}</p>
              <p v-else class="muted assignment-content-text">未填写文本内容。</p>
              <div v-if="submission.files?.length" class="assignment-file-list">
                <button
                  v-for="file in submission.files"
                  :key="file.id"
                  class="ghost"
                  type="button"
                  @click="downloadSubmissionFile(file)"
                >
                  下载提交文件：{{ file.original_filename }}
                </button>
              </div>
              <div v-if="submission.feedback" class="assignment-feedback-block">
                <div class="assignment-submission-header">
                  <strong>教师反馈</strong>
                  <span class="muted">{{ formatDateTime(submission.feedback.updated_at || submission.feedback.created_at) }}</span>
                </div>
                <p v-if="submission.feedback.text_content" class="assignment-content-text">{{ submission.feedback.text_content }}</p>
                <div v-if="submission.feedback.files?.length" class="assignment-file-list">
                  <button
                    v-for="file in submission.feedback.files"
                    :key="file.id"
                    class="ghost"
                    type="button"
                    @click="downloadFeedbackFile(file)"
                  >
                    下载反馈文件：{{ file.original_filename }}
                  </button>
                </div>
              </div>
              <div v-if="canManageAssignments" class="modal-actions assignment-inline-actions">
                <button class="ghost" type="button" @click="openFeedbackDialog(submission)">
                  {{ submission.feedback ? '编辑反馈' : '反馈' }}
                </button>
              </div>
            </div>
          </div>
        </template>
        <p v-if="assignmentDetailError" class="error">{{ assignmentDetailError }}</p>
      </div>
    </div>

    <div v-if="feedbackDialogSubmission" class="overlay">
      <div class="modal classroom-modal assignment-feedback-modal">
        <div class="modal-header">
          <h3>作业反馈</h3>
          <button class="ghost" type="button" @click="closeFeedbackDialog">关闭</button>
        </div>
        <form @submit.prevent="submitFeedback">
          <p class="muted">学生：{{ feedbackDialogSubmission.student_username || '-' }}</p>
          <label>
            反馈内容
            <textarea v-model.trim="feedbackForm.text_content" rows="5" placeholder="可选"></textarea>
          </label>
          <label>
            反馈文件
            <input
              ref="feedbackFileInput"
              type="file"
              accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              @change="handleFeedbackFileChange"
            />
          </label>
          <p v-if="feedbackFile" class="muted selected-file-line">
            {{ feedbackFile.name }} / {{ formatFileSize(feedbackFile.size) }}
          </p>
          <p v-else-if="feedbackDialogSubmission.feedback?.files?.length" class="muted selected-file-line">
            当前反馈附件：{{ feedbackDialogSubmission.feedback.files.map((file) => file.original_filename).join('、') }}
          </p>
          <p v-if="feedbackError" class="error">{{ feedbackError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeFeedbackDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '保存反馈' }}</button>
          </div>
        </form>
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
const { logout, isTeacher } = useAuth();

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

const assignmentDialogOpen = ref(false);
const assignmentDialogItem = ref(null);
const assignmentForm = reactive({ title: '', content: '', is_public: false });
const assignmentFile = ref(null);
const assignmentError = ref('');
const assignmentFileInput = ref(null);
const deleteAssignmentDialog = ref(null);

const assignmentDetailOpen = ref(false);
const loadingAssignmentDetail = ref(false);
const assignmentDetailError = ref('');
const assignmentDetail = ref(null);
const assignmentSubmissions = ref([]);

const submissionForm = reactive({ text_content: '' });
const submissionFile = ref(null);
const submissionError = ref('');
const submissionFileInput = ref(null);

const feedbackDialogSubmission = ref(null);
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
const materialsTotalPages = computed(() => Math.max(1, Math.ceil(materialsTotal.value / materialsPageSize.value)));
const assignmentsTotalPages = computed(() => Math.max(1, Math.ceil(assignmentsTotal.value / assignmentsPageSize.value)));
const membersPage = ref(1);
const membersPageSize = ref(12);
const membersPageJump = ref(1);
const membersTotal = computed(() => detail.value?.members?.length || 0);
const membersTotalPages = computed(() => Math.max(1, Math.ceil(membersTotal.value / membersPageSize.value)));
const pagedMembers = computed(() => {
  const members = detail.value?.members || [];
  const start = (membersPage.value - 1) * membersPageSize.value;
  return members.slice(start, start + membersPageSize.value);
});

function textDisplayWidth(value) {
  return Array.from(String(value || '')).reduce((total, char) => total + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
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
        id_order: assignmentsOrder.value
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
    if (assignmentDetailOpen.value && assignmentDetail.value?.id === assignmentDialogItem.value?.id) {
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
  } catch (err) {
    assignmentDetailError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingAssignmentDetail.value = false;
  }
}

async function openAssignmentDetail(item) {
  assignmentDetailOpen.value = true;
  assignmentDetail.value = item;
  assignmentSubmissions.value = [];
  submissionForm.text_content = '';
  submissionFile.value = null;
  submissionError.value = '';
  if (submissionFileInput.value) submissionFileInput.value.value = '';
  await loadAssignmentDetail(item.id);
}

function closeAssignmentDetail() {
  assignmentDetailOpen.value = false;
  assignmentDetail.value = null;
  assignmentSubmissions.value = [];
  assignmentDetailError.value = '';
}

async function submitAssignmentSubmission() {
  submissionError.value = '';
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
    const path = `/api/user/classes/${route.params.id}/assignments/${assignmentDetail.value.id}/submissions`;
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
    submissionForm.text_content = '';
    submissionFile.value = null;
    if (submissionFileInput.value) submissionFileInput.value.value = '';
    await Promise.all([loadAssignmentDetail(assignmentDetail.value.id), refreshAssignments()]);
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

async function submitFeedback() {
  feedbackError.value = '';
  if (feedbackFile.value) {
    feedbackError.value = validateClassFile(feedbackFile.value);
    if (feedbackError.value) return;
  }
  const hasExistingFile = !!feedbackDialogSubmission.value?.feedback?.files?.length;
  if (!feedbackForm.text_content.trim() && !feedbackFile.value && !hasExistingFile) {
    feedbackError.value = '请填写反馈内容或上传文件';
    return;
  }

  savingAction.value = true;
  try {
    const path = `/api/user/classes/${route.params.id}/assignments/${assignmentDetail.value.id}/submissions/${feedbackDialogSubmission.value.id}/feedback`;
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
    closeFeedbackDialog();
    await loadAssignmentDetail(assignmentDetail.value.id);
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
    if (assignmentDetail.value?.id === deleteAssignmentDialog.value.id) closeAssignmentDetail();
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

function downloadFeedbackFile(file) {
  downloadNamedFile(`/api/user/classes/${route.params.id}/assignments/feedback-files/${file.id}/content`, file.original_filename);
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
