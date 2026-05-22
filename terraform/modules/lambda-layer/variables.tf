variable "node_runtime" {
  type    = string
  default = "nodejs24.x"
}
variable "compatible_architectures" {
  type    = list(string)
  default = ["x86_64"]
}
