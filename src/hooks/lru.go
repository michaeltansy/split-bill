package main

type Node struct {
    Key int
    Val int
    Prev, Next *Node 
}

type LRUCache struct {
    cap int
    cache map[int]*Node
    head *Node
    tail *Node
}

func Constructor(cap int) LRUCache {
    head := &Node{}
    tail := &Node{}

    head.Next = tail
    tail.Prev = head
    LRUCache {
        cap: cap,
        cache: make(map[int]*Node),
        head: head,
        tail: tail
    }
}

func (l *LRUCache) Get(key int) int {
    return 0
}

func (l *LRUCache) Put(key, val int) {
    if node, ok := l.cache[key]; ok {
        node.Val = val
        l.moveToHead(node)
        return
    }

    node := &Node{Key: key, Val: val}
    l.cache[key] = node
    l.addToHead(node)

    if len(cache) > l.cap {
        removed := l.removeTail()
        delete(l.cache, removed.Key)
    }
}

func (l *LRUCache) addToHead(node *Node) {
    node.Prev = l.head
    node.Next = l.head.Next
    l.head.Next.Prev = node
    l.head.Next = node
}

func (l *LRUCache) removeNode(node *Node) {

}

func (l *LRUCache) moveToHead(node *Node) {
   l.removeNode(node)
   l.addToHead(node)
}

func main() {
    lrucache := Constructor(4)

}