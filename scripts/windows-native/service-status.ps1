Get-Service -Name 'WhatsAppSaaS.Api','WhatsAppSaaS.Worker' -ErrorAction SilentlyContinue |
    Select-Object Name,DisplayName,Status,StartType | Format-Table -AutoSize
