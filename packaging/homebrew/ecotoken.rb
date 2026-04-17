# Reference Homebrew formula for ecotoken.
#
# This file is auto-generated and pushed to akhil-gautam/homebrew-tap on every
# `v*` release by .github/workflows/homebrew.yml. The copy here is a seed that
# a human can drop into an empty tap repo to bootstrap the very first install
# before the CI-driven flow takes over. Version/SHA values below are filled in
# for whichever tag was most recently released; CI will overwrite them.

class Ecotoken < Formula
  desc "Environmental impact dashboard for AI coding assistants"
  homepage "https://github.com/akhil-gautam/ecotoken"
  version "0.1.1"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/akhil-gautam/ecotoken/releases/download/v#{version}/ecotoken-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_APPLE_DARWIN_SHA256"
    else
      url "https://github.com/akhil-gautam/ecotoken/releases/download/v#{version}/ecotoken-x86_64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_X86_64_APPLE_DARWIN_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/akhil-gautam/ecotoken/releases/download/v#{version}/ecotoken-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_LINUX_SHA256"
    else
      url "https://github.com/akhil-gautam/ecotoken/releases/download/v#{version}/ecotoken-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "REPLACE_WITH_X86_64_LINUX_SHA256"
    end
  end

  def install
    bin.install "ecotoken"
  end

  test do
    assert_match "ecotoken", shell_output("#{bin}/ecotoken --version")
  end
end
