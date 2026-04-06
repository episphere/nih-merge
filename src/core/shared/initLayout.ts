import { NCIExtendedHeaderWithMegaMenu, DefaultMobileMenuSource } from '@nciocpl/ncids-js/nci-header'
import { NCIBigFooter } from '@nciocpl/ncids-js/usa-footer'

class MegaMenuSource {
  async getMegaMenuContent(_id: number | string): Promise<HTMLElement> {
    return document.getElementById('megamenu-layer')!.cloneNode(true) as HTMLElement
  }
}

export function initLayout(): void {
  const headerEl = document.getElementById('nci-header')
  if (headerEl) {
    NCIExtendedHeaderWithMegaMenu.create(headerEl, {
      megaMenuSource: new MegaMenuSource(),
      mobileMenuSource: new DefaultMobileMenuSource(),
    })
  }

  const footerEl = document.getElementById('nci-footer')
  if (footerEl) {
    NCIBigFooter.create(footerEl)
  }
}
