{{/*
This template serves as a blueprint for Cronjob objects that are created
using the common library.
*/}}
{{- define "bjw-s.common.class.cronjob" -}}
  {{- $rootContext := .rootContext -}}
  {{- $cronjobObject := .object -}}

  {{- $timeZone := "" -}}
  {{- if ge (int $rootContext.Capabilities.KubeVersion.Minor) 27 }}
    {{- $timeZone = dig "cronjob" "timeZone" "" $cronjobObject -}}
  {{- end -}}

  {{- $labels := merge
    (dict "app.kubernetes.io/component" $cronjobObject.identifier)
    ($cronjobObject.labels | default dict)
    (include "bjw-s.common.lib.metadata.allLabels" $rootContext | fromYaml)
  -}}
  {{- $annotations := merge
    ($cronjobObject.annotations | default dict)
    (include "bjw-s.common.lib.metadata.globalAnnotations" $rootContext | fromYaml)
  -}}

  {{- $cronJobSettings := dig "cronjob" dict $cronjobObject -}}
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ $cronjobObject.name }}
  {{- with $labels }}
  labels:
    {{- range $key, $value := . }}
    {{- printf "%s: %s" $key (tpl $value $rootContext | toYaml ) | nindent 4 }}
    {{- end }}
  {{- end }}
  {{- with $annotations }}
  annotations:
    {{- range $key, $value := . }}
    {{- printf "%s: %s" $key (tpl $value $rootContext | toYaml ) | nindent 4 }}
    {{- end }}
  {{- end }}
spec:
  suspend: {{ default false $cronJobSettings.suspend }}
  concurrencyPolicy: {{ default "Forbid" $cronJobSettings.concurrencyPolicy }}
  startingDeadlineSeconds: {{ include "bjw-s.common.lib.defaultKeepNonNullValue" (dict "value" $cronJobSettings.startingDeadlineSeconds "default" 30) }}
  {{- with $timeZone }}
  timeZone: {{ . }}
  {{- end }}
  schedule: {{ $cronJobSettings.schedule | quote }}
  successfulJobsHistoryLimit: {{ include "bjw-s.common.lib.defaultKeepNonNullValue" (dict "value" $cronJobSettings.successfulJobsHistory "default" 1) }}
  failedJobsHistoryLimit: {{ include "bjw-s.common.lib.defaultKeepNonNullValue" (dict "value" $cronJobSettings.failedJobsHistory "default" 1) }}
  jobTemplate:
    spec:
      {{- with $cronJobSettings.activeDeadlineSeconds }}
      activeDeadlineSeconds: {{ . }}
      {{- end }}
      {{- with $cronJobSettings.ttlSecondsAfterFinished }}
      ttlSecondsAfterFinished: {{ . }}
      {{- end }}
      {{- with $cronJobSettings.parallelism }}
      parallelism: {{ . }}
      {{- end }}
      backoffLimit: {{ include "bjw-s.common.lib.defaultKeepNonNullValue" (dict "value" $cronJobSettings.backoffLimit "default" 6) }}
      template:
        metadata:
          {{- with (include "bjw-s.common.lib.pod.metadata.annotations" (dict "rootContext" $rootContext "controllerObject" $cronjobObject)) }}
          annotations: {{ . | nindent 12 }}
          {{- end -}}
          {{- with (include "bjw-s.common.lib.pod.metadata.labels" (dict "rootContext" $rootContext "controllerObject" $cronjobObject)) }}
          labels: {{ . | nindent 12 }}
          {{- end }}
        spec: {{ include "bjw-s.common.lib.pod.spec" (dict "rootContext" $rootContext "controllerObject" $cronjobObject) | nindent 10 }}
{{- end -}}
